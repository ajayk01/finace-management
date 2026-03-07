
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
    category?: string;
    subCategory?: string;
    accountId?: string;
    accountName?: string;
    categoryId?: string;
    subCategoryId?: string;
    investmentAccountId?: string;
    investmentAccountName?: string;
    capId?: string;
    rewards?: number;
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

async function fetchCreditCardTransactionsFromDB(
  creditCardId: string,
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
        t.TO_ACCOUNT_ID,
        t.CATEGORY_ID,
        t.SUB_CATEGORY_ID,
        c.CATEGORY_NAME,
        sc.SUB_CATEGORY_NAME,
        aFrom.ACCOUNT_NAME AS FROM_ACCOUNT_NAME,
        aTo.ACCOUNT_NAME AS TO_ACCOUNT_NAME,
        cct.CapId AS CAP_ID,
        cct.Rewards AS REWARDS
      FROM Transactions t
      LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
      LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
      LEFT JOIN Accounts aFrom ON t.FROM_ACCOUNT_ID = aFrom.ID
      LEFT JOIN Accounts aTo ON t.TO_ACCOUNT_ID = aTo.ID
      LEFT JOIN CreditCardTransactions cct ON t.ID = cct.TransactionId
      WHERE (t.FROM_ACCOUNT_ID = ? OR t.TO_ACCOUNT_ID = ?)
    `;

    const params: any[] = [creditCardId, creditCardId];

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
      CATEGORY_ID: number;
      SUB_CATEGORY_ID: number;
      CATEGORY_NAME: string;
      SUB_CATEGORY_NAME: string;
      FROM_ACCOUNT_NAME: string;
      TO_ACCOUNT_NAME: string;
      CAP_ID: number | null;
      REWARDS: number | null;
    }>(sql, params);

    console.log(`Fetched ${transactions.length} credit card transactions for account ${creditCardId}`);

    // Build a map of charges amounts keyed by the actual transaction ID they belong to.
    // Charges transactions have NOTES like "Charges for <transactionId>".
    const chargesMap = new Map<string, number>();
    const chargesTxIds = new Set<string>();

    for (const tx of transactions) {
      const notes = (tx.NOTES || '') as string;
      const match = notes.match(/^Charges for (\d+)$/);
      if (match) {
        const parentId = match[1];
        chargesMap.set(parentId, (chargesMap.get(parentId) || 0) + Number(tx.AMOUNT));
        chargesTxIds.add(tx.ID.toString());
      }
    }

    // Filter out the charges transactions themselves and add their amounts to the parent
    const filteredTransactions = transactions.filter((tx: any) => !chargesTxIds.has(tx.ID.toString()));

    // Map to Transaction interface and determine type
    return filteredTransactions.map((tx: any) => {
      // Add charges amount to the parent transaction
      const chargesAmount = chargesMap.get(tx.ID.toString()) || 0;
      const totalAmount = Number(tx.AMOUNT) + chargesAmount;
      let type: Transaction['type'] = 'Other';
      let category = '';
      let subCategory = '';
      let accountId = '';
      let accountName = '';
      let investmentAccountId = '';
      let investmentAccountName = '';
      
      // Determine transaction type based on TRANSCATION_TYPE and account direction
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
      } else if (tx.TRANSCATION_TYPE === TransactionType.TRANSFER) {
        // Transfers TO credit card are payments
        if (tx.TO_ACCOUNT_ID.toString() === creditCardId) {
          type = 'Income';
        } else {
          type = 'Other';
        }
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
        amount: totalAmount,
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
        rewards: tx.REWARDS ?? undefined,
      };
    });
  } catch (error) {
    console.error("Error fetching credit card transactions from database:", error);
    throw new Error("Failed to fetch credit card transactions from database.");
  }
}


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const creditCardId = searchParams.get('creditCardId');
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (!creditCardId) {
      return NextResponse.json({ error: "creditCardId is a required query parameter." }, { status: 400 });
    }

    let fromTimestamp: number | undefined;
    let toTimestamp: number | undefined;

    if (month && year) {
      const { startDate, endDate } = getFromToDates(month, parseInt(year, 10));
      fromTimestamp = startDate.getTime();
      toTimestamp = endDate.getTime();
    }

    const allTransactions = await fetchCreditCardTransactionsFromDB(
      creditCardId,
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
    console.error("Error in /api/credit-card-transactions:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching transactions.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
