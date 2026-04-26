
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, TransactionType } from '@/lib/db';
import type { Transaction as DBTransaction } from '@/types/database';
import { getFromToDates } from '@/lib/date-utils';

interface SplitwiseDetail {
  splitwiseTransactionId: string;
  friendId: string;
  friendName: string;
  splitwiseFriendId: string;
  splitAmount: number;
}

interface Transaction {
    id: string;
    date: string | null;
    time: string;
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
    splitwiseDetails?: SplitwiseDetail[];
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
        t.TO_ACCOUNT_ID,
        t.CATEGORY_ID,
        t.SUB_CATEGORY_ID,
        c.CATEGORY_NAME,
        sc.SUB_CATEGORY_NAME,
        aFrom.ACCOUNT_NAME AS FROM_ACCOUNT_NAME,
        aTo.ACCOUNT_NAME AS TO_ACCOUNT_NAME,
        cct.CapId AS CAP_ID
      FROM Transactions t
      LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
      LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
      LEFT JOIN Accounts aFrom ON t.FROM_ACCOUNT_ID = aFrom.ID
      LEFT JOIN Accounts aTo ON t.TO_ACCOUNT_ID = aTo.ID
      LEFT JOIN CreditCardTransactions cct ON t.ID = cct.TransactionId
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
      CATEGORY_ID: number;
      SUB_CATEGORY_ID: number;
      CATEGORY_NAME: string;
      SUB_CATEGORY_NAME: string;
      FROM_ACCOUNT_NAME: string;
      TO_ACCOUNT_NAME: string;
      CAP_ID: number | null;
    }>(sql, params);

    console.log(`Fetched ${transactions.length} bank transactions for account ${bankAccountId}`);

    // Map to Transaction interface and determine type
    // Map to Transaction interface and determine type
    const mappedTransactions = transactions.map((tx: any) => {
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
      } else if (tx.TRANSCATION_TYPE === TransactionType.INVESTMENT) {
        type = 'Investment';
        category = tx.TO_ACCOUNT_NAME || 'Uncategorized';
        accountId = tx.FROM_ACCOUNT_ID?.toString() || '';
        accountName = tx.FROM_ACCOUNT_NAME || '';
        investmentAccountId = tx.TO_ACCOUNT_ID?.toString() || '';
        investmentAccountName = tx.TO_ACCOUNT_NAME || '';
      } else if (tx.TRANSCATION_TYPE === TransactionType.TRANSFER) {
        type = 'Other';
        category = tx.FROM_ACCOUNT_NAME || 'Transfer';
        subCategory = tx.TO_ACCOUNT_NAME || '';
        accountId = tx.FROM_ACCOUNT_ID?.toString() || '';
        accountName = tx.FROM_ACCOUNT_NAME || '';
        investmentAccountId = tx.TO_ACCOUNT_ID?.toString() || '';
        investmentAccountName = tx.TO_ACCOUNT_NAME || '';
      }

      const txDate = new Date(tx.DATE);
      return {
        id: tx.ID.toString(),
        date: txDate.toISOString().split('T')[0],
        time: txDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
        description: tx.NOTES || 'No Description',
        amount: tx.AMOUNT,
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

    // Fetch splitwise details for all transactions in bulk
    const transactionIds = mappedTransactions.map((tx: Transaction) => tx.id);
    if (transactionIds.length > 0) {
      const placeholders = transactionIds.map(() => '?').join(',');
      const splitwiseRows = await query<{
        TRANSACTION_ID: number;
        SPLITWISE_TRANSACTION_ID: string;
        FRIEND_ID: number;
        FRIEND_NAME: string;
        SPLITWISE_FRIEND_ID: number;
        SPLITED_AMOUNT: number;
      }>(
        `SELECT st.TRANSACTION_ID, st.SPLITWISE_TRANSACTION_ID, st.FRIEND_ID, sf.NAME AS FRIEND_NAME, sf.SPLITWISE_FRIEND_ID, st.SPLITED_AMOUNT
         FROM SplitwiseTransactions st
         INNER JOIN SplitwiseFriends sf ON st.FRIEND_ID = sf.ID
         WHERE st.TRANSACTION_ID IN (${placeholders})`,
        transactionIds.map(Number)
      );

      // Group splitwise rows by transaction ID
      const splitwiseMap = new Map<string, SplitwiseDetail[]>();
      for (const row of splitwiseRows) {
        const txId = row.TRANSACTION_ID.toString();
        if (!splitwiseMap.has(txId)) {
          splitwiseMap.set(txId, []);
        }
        splitwiseMap.get(txId)!.push({
          splitwiseTransactionId: row.SPLITWISE_TRANSACTION_ID,
          friendId: row.FRIEND_ID.toString(),
          friendName: row.FRIEND_NAME,
          splitwiseFriendId: row.SPLITWISE_FRIEND_ID.toString(),
          splitAmount: Number(row.SPLITED_AMOUNT),
        });
      }

      // Attach splitwise details to transactions
      for (const tx of mappedTransactions) {
        const details = splitwiseMap.get(tx.id);
        if (details && details.length > 0) {
          tx.splitwiseDetails = details;
        }
      }
    }

    return mappedTransactions;
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
