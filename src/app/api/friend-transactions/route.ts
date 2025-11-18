'use server';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { SplitwiseTransaction } from '@/types/database';

/**
 * Fetch Splitwise transactions for a specific friend from database
 */
async function fetchFriendTransactionsFromDB(friendId: string): Promise<any[]> {
  const sql = `
    SELECT 
      st.SPLITWISE_TRANSACTION_ID,
      st.TRANSACTION_ID,
      st.SPLITED_AMOUNT,
      st.FRIEND_ID,
      t.DATE,
      t.NOTES as DESCRIPTION,
      t.AMOUNT as TOTAL_AMOUNT,
      c.CATEGORY_NAME,
      sc.SUB_CATEGORY_NAME,
      t.FROM_ACCOUNT_ID as ACCOUNT_ID
    FROM SplitwiseTransactions st
    INNER JOIN Transactions t ON st.TRANSACTION_ID = t.ID
    LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
    LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
    WHERE st.FRIEND_ID = ?
    ORDER BY t.DATE DESC
  `;
  
  const transactions = await query<any>(sql, [friendId]);
  console.log(`Fetched ${transactions.length} transactions for friend ${friendId}`);
  
  return transactions.map((tx: any) => ({
    id: tx.TRANSACTION_ID,
    splitwiseId: tx.SPLITWISE_TRANSACTION_ID,
    date: tx.DATE ? new Date(tx.DATE).toISOString().split('T')[0] : null,
    description: tx.DESCRIPTION || '',
    amount: tx.SPLITED_AMOUNT || 0,
    totalAmount: tx.TOTAL_AMOUNT || 0,
    category: tx.CATEGORY_NAME || '',
    subCategory: tx.SUB_CATEGORY_NAME || '',
    accountId: tx.ACCOUNT_ID || null,
    friendId: tx.FRIEND_ID,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const friendName = searchParams.get('friendName');
    const friendId = searchParams.get('friendPageId') || searchParams.get('friendId');

    if (!friendId) {
      return NextResponse.json({ error: 'Friend ID is required' }, { status: 400 });
    }

    const transactions = await fetchFriendTransactionsFromDB(friendId);
    console.log("fetchFriendTransactionsFromDB : ",transactions)
    return NextResponse.json({ 
      transactions,
      friendName: friendName || null,
      friendId: friendId,
      count: transactions.length 
    });

  } catch (error) {
    console.error('Error fetching friend transactions:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch friend transactions' 
    }, { status: 500 });
  }
}
