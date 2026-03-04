import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, TransactionType, CategoryType } from '@/lib/db';

interface Transaction {
  id: string;
  date: string | null;
  description: string;
  amount: number;
  type: 'Income' | 'Expense' | 'Investment' | 'Transfer';
  category?: string;
  subCategory?: string;
  accountId?: string;
  accountName?: string;
  categoryId?: string;
  subCategoryId?: string;
  investmentAccountId?: string;
  investmentAccountName?: string;
}

const monthMap: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function getFromToDates(month: string, year: number) {
  const monthIndex = monthMap[month.toLowerCase()];

  if (monthIndex === undefined) {
    throw new Error("Invalid month provided. Please use full month names (e.g., 'Jan', 'February').");
  }

  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 0);

  return { startDate, endDate };
}

async function fetchAllTransactionsFromDB({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<Transaction[]> {
  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const fromTimestamp = startDate.getTime();
    const toTimestamp = endDate.getTime();

    const sql = `
      SELECT 
    t.ID,
    t.DATE,
    t.AMOUNT,
    t.NOTES,
    t.TRANSCATION_TYPE,
    c.CATEGORY_NAME,
    sc.SUB_CATEGORY_NAME,
    t.CATEGORY_ID,
    t.SUB_CATEGORY_ID,
    t.FROM_ACCOUNT_ID,
    t.TO_ACCOUNT_ID,
    aFrom.ACCOUNT_NAME AS FROM_ACCOUNT_NAME,
    aTo.ACCOUNT_NAME AS TO_ACCOUNT_NAME,
    cct.CAP_ID
    FROM Transactions t
    LEFT JOIN Category c 
        ON t.CATEGORY_ID = c.ID
    LEFT JOIN SubCategory sc 
        ON t.SUB_CATEGORY_ID = sc.ID
    LEFT JOIN Accounts aFrom 
        ON t.FROM_ACCOUNT_ID = aFrom.ID
    LEFT JOIN Accounts aTo 
        ON t.TO_ACCOUNT_ID = aTo.ID
    LEFT JOIN CreditCardCapTransactions cct 
        ON t.ID = cct.TRANSACTION_ID
    WHERE t.DATE BETWEEN ? AND ?
    ORDER BY t.DATE DESC;
    `;

    console.log("Executing SQL to fetch all transactions ", sql);

    const transactions = await query<{
      ID: number;
      DATE: number;
      AMOUNT: number;
      NOTES: string;
      TRANSCATION_TYPE: number;
      CATEGORY_NAME: string;
      SUB_CATEGORY_NAME: string;
      CATEGORY_ID: number;
      SUB_CATEGORY_ID: number;
      FROM_ACCOUNT_ID: number;
      TO_ACCOUNT_ID: number;
      FROM_ACCOUNT_NAME: string;
      TO_ACCOUNT_NAME: string;
      CAP_ID: number | null;
    }>(sql, [fromTimestamp, toTimestamp]);

    console.log(`Fetched ${transactions.length} total transactions`);

    return transactions
      .filter((tx: any) => tx.AMOUNT !== 0)
      .map((tx: any) => {
        let type: 'Income' | 'Expense' | 'Investment' | 'Transfer' = 'Expense';
        let category = '';
        let subCategory = '';
        let accountId = '';
        let accountName = '';
        let investmentAccountId = '';
        let investmentAccountName = '';

        if (tx.TRANSCATION_TYPE === TransactionType.EXPENSE) {
          type = 'Expense';
          category = tx.CATEGORY_NAME || '';
          subCategory = tx.SUB_CATEGORY_NAME || '';
          accountId = tx.FROM_ACCOUNT_ID?.toString() || '';
          accountName = tx.FROM_ACCOUNT_NAME || '';
        } else if (tx.TRANSCATION_TYPE === TransactionType.INCOME) {
          type = 'Income';
          category = tx.CATEGORY_NAME || '';
          subCategory = tx.SUB_CATEGORY_NAME || '';
          accountId = tx.TO_ACCOUNT_ID?.toString() || '';
          accountName = tx.TO_ACCOUNT_NAME || '';
        } else if (tx.TRANSCATION_TYPE === TransactionType.INVESTMENT) {
          type = 'Investment';
          category = tx.TO_ACCOUNT_NAME || 'Uncategorized';
          subCategory = '';
          accountId = tx.FROM_ACCOUNT_ID?.toString() || '';
          accountName = tx.FROM_ACCOUNT_NAME || '';
          investmentAccountId = tx.TO_ACCOUNT_ID?.toString() || '';
          investmentAccountName = tx.TO_ACCOUNT_NAME || '';
        } else if (tx.TRANSCATION_TYPE === TransactionType.TRANSFER) {
          type = 'Transfer';
          category = tx.FROM_ACCOUNT_NAME || 'Transfer';
          subCategory = tx.TO_ACCOUNT_NAME || '';
          accountId = tx.FROM_ACCOUNT_ID?.toString() || '';
          accountName = tx.FROM_ACCOUNT_NAME || '';
          investmentAccountId = tx.TO_ACCOUNT_ID?.toString() || '';
          investmentAccountName = tx.TO_ACCOUNT_NAME || '';
        }

        return {
          id: tx.ID.toString(),
          date: new Date(tx.DATE).toISOString().split('T')[0],
          description: tx.NOTES || 'No Description',
          amount: Number(tx.AMOUNT),
          type,
          category,
          subCategory,
          accountId,
          accountName,
          categoryId: tx.CATEGORY_ID?.toString() || '',
          subCategoryId: tx.SUB_CATEGORY_ID?.toString() || '',
          investmentAccountId,
          investmentAccountName,
          capId: tx.CAP_ID?.toString() || undefined,
        };
      });
  } catch (error) {
    console.error("Error fetching all transactions from database:", error);
    throw new Error("Failed to fetch all transactions from database.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    if (!month || !year) {
      return NextResponse.json({ error: "Month and year are required query parameters." }, { status: 400 });
    }

    const allTransactions = await fetchAllTransactionsFromDB({ month, year });

    // Sort transactions by date (newest first)
    allTransactions.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({
      transactions: allTransactions
    });
  } catch (error) {
    console.error("Error in /api/all-transactions:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching transactions.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const transactionId = parseInt(id, 10);

    // Check for linked Splitwise transactions and delete the expense from Splitwise API
    const splitwiseRows = await query<{ SPLITWISE_TRANSACTION_ID: string }>(
      `SELECT DISTINCT SPLITWISE_TRANSACTION_ID FROM SplitwiseTransactions WHERE TRANSACTION_ID = ?`,
      [transactionId]
    );

    if (splitwiseRows.length > 0) {
      const SPLITWISE_API_KEY = process.env.SPLITWISE_API_KEY;
      if (SPLITWISE_API_KEY) {
        for (const row of splitwiseRows) {
          try {
            const res = await fetch(
              `https://secure.splitwise.com/api/v3.0/delete_expense/${row.SPLITWISE_TRANSACTION_ID}`,
              {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${SPLITWISE_API_KEY}` },
              }
            );
            if (res.ok) {
              console.log(`✅ Deleted Splitwise expense ${row.SPLITWISE_TRANSACTION_ID}`);
            } else {
              console.warn(`⚠️ Failed to delete Splitwise expense ${row.SPLITWISE_TRANSACTION_ID}: ${res.status}`);
            }
          } catch (swError) {
            console.warn(`⚠️ Error deleting Splitwise expense ${row.SPLITWISE_TRANSACTION_ID}:`, swError);
          }
        }
      }
    }
    await query(`DELETE FROM Transactions WHERE ID = ?`, [transactionId]);

    return NextResponse.json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while deleting transaction.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
