'use server';

import { NextRequest, NextResponse } from 'next/server';
import { query, TransactionType } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { friendId, bankAccountId } = await request.json();

    if (!friendId || !bankAccountId) {
      return NextResponse.json({ 
        error: 'Friend ID and bank account ID are required' 
      }, { status: 400 });
    }

    const offsetEntries = [];
    const accountId = parseInt(bankAccountId);
    const friendDbId = parseInt(friendId);
    
    if (isNaN(accountId) || isNaN(friendDbId)) {
      return NextResponse.json({ error: 'Invalid bank account ID or friend ID' }, { status: 400 });
    }

    // Fetch all unsettled transactions for this friend
    const fetchTransactionsSql = `
      SELECT 
        st.SPLITWISE_TRANSACTION_ID as SPLITWISE_TX_ID,
        st.TRANSACTION_ID,
        st.SPLITED_AMOUNT,
        t.DATE,
        t.NOTES,
        t.CATEGORY_ID,
        t.SUB_CATEGORY_ID,
        sf.NAME as FRIEND_NAME
      FROM SplitwiseTransactions st
      INNER JOIN Transactions t ON st.TRANSACTION_ID = t.ID
      INNER JOIN SplitwiseFriends sf ON st.FRIEND_ID = sf.ID
      WHERE st.FRIEND_ID = ?
      ORDER BY t.DATE ASC
    `;

    const transactions = await query<{
      SPLITWISE_TX_ID: number;
      TRANSACTION_ID: number;
      SPLITED_AMOUNT: number;
      DATE: number;
      NOTES: string;
      CATEGORY_ID: number | null;
      SUB_CATEGORY_ID: number | null;
      FRIEND_NAME: string;
    }>(fetchTransactionsSql, [friendDbId]);

    console.log(`Found ${transactions.length} unsettled transactions for friend ID ${friendDbId}`);

    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unsettled transactions found for this friend',
        offsetEntries: [],
      });
    }

    const friendName = transactions[0].FRIEND_NAME;

    // Process each transaction and create offsetting entry
    for (const tx of transactions) {
      try {
        const settlementAmount = tx.SPLITED_AMOUNT;
        const description = tx.NOTES || 'Splitwise expense';

        // Create offsetting settlement entry (negative amount = income/settlement)
        const settlementSql = `
          INSERT INTO Transactions 
          (AMOUNT, DATE, NOTES, TO_ACCOUNT_ID, CATEGORY_ID, SUB_CATEGORY_ID, TRANSCATION_TYPE) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const settlementResult = await query(settlementSql, [
          -Math.abs(settlementAmount), // Negative amount = settlement received (income)
          tx.DATE,
          `Settlement from: ${friendName} - ${description}`,
          accountId, // Money received in this bank account (TO_ACCOUNT_ID for income)
          tx.CATEGORY_ID,
          tx.SUB_CATEGORY_ID,
          TransactionType.EXPENSE // Settlement is recorded as income
        ]);

        console.log(`Created settlement transaction ID: ${settlementResult.insertId}`);

        // Delete the Splitwise transaction entry
        await query(
          `DELETE FROM SplitwiseTransactions WHERE TRANSACTION_ID = ?`,
          [tx.TRANSACTION_ID]
        );
        console.log(`Deleted  transaction ${tx.TRANSACTION_ID}`);


        offsetEntries.push({
          id: settlementResult.insertId,
          originalTransactionId: tx.TRANSACTION_ID,
          splitwiseTransactionId: tx.SPLITWISE_TX_ID,
          amount: -settlementAmount,
          description: `Settlement from: ${friendName}`,
        });

      } catch (error) {
        console.error(`Error creating settlement for transaction ${tx.TRANSACTION_ID}:`, error);
        // Continue with other transactions even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${offsetEntries.length} settlement entries for ${friendName}`,
      offsetEntries,
    });

  } catch (error) {
    console.error('Error creating settlement entries:', error);
    return NextResponse.json({ 
      error: 'Failed to create settlement entries' 
    }, { status: 500 });
  }
}
