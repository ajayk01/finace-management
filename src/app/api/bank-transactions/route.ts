
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, TransactionType } from '@/lib/db';
import type { Transaction as DBTransaction } from '@/types/database';

interface Transaction {
    id: string;
    date: string | null;
    description: string;
    amount: number;
    type: 'Income' | 'Expense' | 'Investment' | 'Other';
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

async function fetchBankTransactionsFromDB(
  bankAccountId: string,
  fromTimestamp?: number,
  toTimestamp?: number
): Promise<Transaction[]> {
  try {
    // Build SQL query with optional date filters
    let sql = `
      SELECT 
        t.ID,
        t.DATE,
        t.AMOUNT,
        t.NOTES,
        t.TRANSCATION_TYPE,
        t.FROM_ACCOUNT_ID,
        t.TO_ACCOUNT_ID
      FROM Transactions t
      WHERE (t.FROM_ACCOUNT_ID = ? OR t.TO_ACCOUNT_ID = ?)
    `;

    const params: any[] = [bankAccountId, bankAccountId];

    if (fromTimestamp !== undefined && toTimestamp !== undefined) {
      sql += ` AND t.DATE >= ? AND t.DATE <= ?`;
      params.push(fromTimestamp, toTimestamp);
    }

    sql += ` ORDER BY t.DATE DESC`;

    const transactions = await query<{
      ID: number;
      DATE: number;
      AMOUNT: number;
      NOTES: string;
      TRANSCATION_TYPE: number;
      FROM_ACCOUNT_ID: number;
      TO_ACCOUNT_ID: number;
    }>(sql, params);

    console.log(`Fetched ${transactions.length} bank transactions for account ${bankAccountId}`);

    // Map to Transaction interface and determine type
    return transactions.map((tx: any) => {
      let type: Transaction['type'] = 'Other';
      
      // Determine transaction type based on TRANSCATION_TYPE and account direction
      if (tx.TRANSCATION_TYPE === TransactionType.EXPENSE) {
        type = 'Expense';
      } else if (tx.TRANSCATION_TYPE === TransactionType.INCOME) {
        type = 'Income';
      } else if (tx.TRANSCATION_TYPE === TransactionType.INVESTMENT) {
        // Investment is outgoing from bank account
        type = 'Investment';
      } else if (tx.TRANSCATION_TYPE === TransactionType.TRANSFER) {
        // For transfers, we could show them as transfers or determine direction
        type = 'Other';
      }

      return {
        id: tx.ID.toString(),
        date: new Date(tx.DATE).toISOString().split('T')[0],
        description: tx.NOTES || 'No Description',
        amount: tx.AMOUNT,
        type
      };
    });
  } catch (error) {
    console.error("Error fetching bank transactions from database:", error);
    throw new Error("Failed to fetch bank transactions from database.");
  }
}


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bankAccountId = searchParams.get('bankAccountId');
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!bankAccountId) {
      return NextResponse.json({ error: "bankAccountId is a required query parameter." }, { status: 400 });
    }

    let fromTimestamp: number | undefined;
    let toTimestamp: number | undefined;

    if (month && year) {
      const { startDate, endDate } = getFromToDates(month, parseInt(year, 10));
      fromTimestamp = startDate.getTime();
      toTimestamp = endDate.getTime();
    }

    const allTransactions = await fetchBankTransactionsFromDB(
      bankAccountId,
      fromTimestamp,
      toTimestamp
    );

    // Sort by date descending (already sorted in query, but keeping for consistency)
    allTransactions.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({ transactions: allTransactions });

  } catch (error) {
    console.error("Error in /api/bank-transactions:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching transactions.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
