'use server';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const SPLITWISE_API_KEY = process.env.SPLITWISE_API_KEY;

// Helper function to make authenticated requests to Splitwise
async function fetchSplitwise(endpoint: string) {
  const url = `https://secure.splitwise.com/api/v3.0/${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SPLITWISE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
    console.error(`Splitwise API error for endpoint ${endpoint}:`, { status: response.status, body: errorBody });
    throw new Error(`Splitwise API request failed with status ${response.status}`);
  }

  return response.json();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const friendId = searchParams.get('friendId');

    if (!friendId) {
      return NextResponse.json({ error: 'Friend ID is required' }, { status: 400 });
    }

    // Fetch all unsettled transactions (where TRANSACTION_ID is NULL) for this friend
    const fetchUnsettledSql = `
      SELECT 
        st.SPLITWISE_TRANSACTION_ID,
        st.FRIEND_ID,
        st.SPLITED_AMOUNT,
        sf.NAME as FRIEND_NAME,
        sf.SPLITWISE_FRIEND_ID
      FROM SplitwiseTransactions st
      INNER JOIN SplitwiseFriends sf ON st.FRIEND_ID = sf.ID
      WHERE st.FRIEND_ID = ? AND st.TRANSACTION_ID IS NULL
      ORDER BY st.SPLITWISE_TRANSACTION_ID DESC
    `;

    const unsettledTransactions = await query<{
      SPLITWISE_TRANSACTION_ID: string;
      FRIEND_ID: number;
      SPLITED_AMOUNT: number;
      FRIEND_NAME: string;
      SPLITWISE_FRIEND_ID: number;
    }>(fetchUnsettledSql, [friendId]);

    console.log(`Found ${unsettledTransactions.length} unsettled transactions for friend ID ${friendId}`);

    if (unsettledTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        expenses: [],
        message: 'No unsettled transactions found for this friend',
      });
    }

    // Fetch expense details from Splitwise API for each transaction
    const expenseDetails = [];

    for (const tx of unsettledTransactions) {
      try {
        const expenseData = await fetchSplitwise(`get_expense/${tx.SPLITWISE_TRANSACTION_ID}`);
        const expense = expenseData.expense;

        // Format date
        const expenseDate = new Date(expense.date);
        const formattedDate = expenseDate.toISOString().split('T')[0]; // YYYY-MM-DD format

        expenseDetails.push({
          splitwiseTransactionId: tx.SPLITWISE_TRANSACTION_ID,
          friendId: tx.FRIEND_ID,
          friendName: tx.FRIEND_NAME,
          date: formattedDate,
          description: expense.description || 'Splitwise expense',
          splitedAmount: tx.SPLITED_AMOUNT,
          totalAmount: parseFloat(expense.cost || '0'),
          categoryId: null,
          subCategoryId: null,
        });

        console.log(`Fetched expense ${tx.SPLITWISE_TRANSACTION_ID}: ${formattedDate} - ${expense.description}`);
      } catch (error) {
        console.error(`Failed to fetch expense ${tx.SPLITWISE_TRANSACTION_ID}:`, error);
        // Include transaction even if API call fails, with minimal info
        expenseDetails.push({
          splitwiseTransactionId: tx.SPLITWISE_TRANSACTION_ID,
          friendId: tx.FRIEND_ID,
          friendName: tx.FRIEND_NAME,
          date: null,
          description: 'Unable to fetch expense details',
          splitedAmount: tx.SPLITED_AMOUNT,
          totalAmount: 0,
          categoryId: null,
          subCategoryId: null,
          error: true,
        });
      }
    }

    return NextResponse.json({
      success: true,
      expenses: expenseDetails,
      count: expenseDetails.length,
    });

  } catch (error) {
    console.error('Error fetching unsettled Splitwise expenses:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch unsettled expenses',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
