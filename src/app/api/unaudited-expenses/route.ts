import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as z from "zod";

import { query, transaction, TransactionType } from "@/lib/db";

interface UnauditedExpenseTransaction {
  id: string;
  date: string | null;
  amount: number;
  accountName?: string;
  description: string;
  categoryId?: string;
  subCategoryId?: string;
  category?: string;
  subCategory?: string;
}

async function fetchUnauditedExpenseTransactions(): Promise<UnauditedExpenseTransaction[]> {
  const sql = `
    SELECT
      t.ID,
      t.DATE,
      t.AMOUNT,
      t.NOTES,
      t.CATEGORY_ID,
      t.SUB_CATEGORY_ID,
      c.CATEGORY_NAME,
      sc.SUB_CATEGORY_NAME,
      aFrom.ACCOUNT_NAME AS FROM_ACCOUNT_NAME
    FROM Transactions t
    LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
    LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
    LEFT JOIN Accounts aFrom ON t.FROM_ACCOUNT_ID = aFrom.ID
    WHERE t.TRANSCATION_TYPE = ?
      AND (t.CATEGORY_ID IS NULL OR t.CATEGORY_ID = 0)
    ORDER BY t.DATE DESC;
  `;

  const rows = await query<{
    ID: number;
    DATE: number | null;
    AMOUNT: number;
    NOTES: string | null;
    CATEGORY_ID: number | null;
    SUB_CATEGORY_ID: number | null;
    CATEGORY_NAME: string | null;
    SUB_CATEGORY_NAME: string | null;
    FROM_ACCOUNT_NAME: string | null;
  }>(sql, [TransactionType.EXPENSE]);

  return (rows || [])
    .filter((r: any) => Number(r.AMOUNT) !== 0)
    .map((r: any) => {
      const date = r.DATE ? new Date(r.DATE).toISOString().split("T")[0] : null;
      return {
        id: String(r.ID),
        date,
        amount: Number(r.AMOUNT),
        accountName: r.FROM_ACCOUNT_NAME || "",
        description: r.NOTES || "",
        categoryId: r.CATEGORY_ID ? String(r.CATEGORY_ID) : "",
        subCategoryId: r.SUB_CATEGORY_ID ? String(r.SUB_CATEGORY_ID) : "",
        category: r.CATEGORY_NAME || "",
        subCategory: r.SUB_CATEGORY_NAME || "",
      };
    });
}

const updateUnauditedExpenseSingleSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  subCategoryId: z.string().optional(),
  description: z.string().optional(),
});

const updateUnauditedExpenseBulkSchema = z.object({
  updates: z
    .array(updateUnauditedExpenseSingleSchema)
    .min(1, "At least one update is required"),
});

const deleteUnauditedExpenseSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one id is required"),
});

export async function GET() {
  try {
    const transactions = await fetchUnauditedExpenseTransactions();
    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("Error in /api/unaudited-expenses GET:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateUnauditedExpenseBulkSchema.safeParse(body);

    const sql = `
        UPDATE Transactions
        SET NOTES = ?,
            CATEGORY_ID = ?,
            SUB_CATEGORY_ID = ?
        WHERE ID = ? AND TRANSCATION_TYPE = ?
      `;

    if (parsed.success) {
      const updates = parsed.data.updates;

      await transaction(async (connection) => {
        for (const update of updates) {
          await connection.execute(sql, [
            update.description || "",
            parseInt(update.categoryId, 10),
            update.subCategoryId ? parseInt(update.subCategoryId, 10) : null,
            parseInt(update.id, 10),
            TransactionType.EXPENSE,
          ]);
        }
      });

      return NextResponse.json({ success: true, updatedIds: updates.map((u) => u.id) });
    }

    const single = updateUnauditedExpenseSingleSchema.parse(body);
    await query(sql, [
      single.description || "",
      parseInt(single.categoryId, 10),
      single.subCategoryId ? parseInt(single.subCategoryId, 10) : null,
      parseInt(single.id, 10),
      TransactionType.EXPENSE,
    ]);

    return NextResponse.json({ success: true, updatedIds: [single.id] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data provided.", details: error.errors }, { status: 400 });
    }

    console.error("Error in /api/unaudited-expenses PUT:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = deleteUnauditedExpenseSchema.parse(body);

    const ids = parsed.ids.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return NextResponse.json({ error: "No valid ids provided." }, { status: 400 });
    }

    const placeholders = ids.map(() => "?").join(",");
    const sql = `
      DELETE FROM Transactions
      WHERE TRANSCATION_TYPE = ?
        AND ID IN (${placeholders})
    `;

    await query(sql, [TransactionType.EXPENSE, ...ids]);

    return NextResponse.json({ success: true, deletedIds: parsed.ids });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data provided.", details: error.errors }, { status: 400 });
    }

    console.error("Error in /api/unaudited-expenses DELETE:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
