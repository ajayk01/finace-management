'use server';

import { NextRequest, NextResponse } from 'next/server';
import { query, TransactionType } from '@/lib/db';

interface UnsettledExpenseInput {
  splitwiseTransactionId: string;
  date: string;
  description: string;
  splitedAmount: number;
  categoryId: number | null;
  subCategoryId: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const { friendId, bankAccountId, unsettledExpenses, settledTransactionIds } = await request.json();
    console.log(" unsettledExpenses ",unsettledExpenses);
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

    // Get friend name
    const friendResult = await query<{ NAME: string }>(
      'SELECT NAME FROM SplitwiseFriends WHERE ID = ?',
      [friendDbId]
    );
    
    if (friendResult.length === 0) {
      return NextResponse.json({ error: 'Friend not found' }, { status: 404 });
    }
    
    let friendName = friendResult[0].NAME;

    // Process unsettled expenses (new transactions from Splitwise)
    if (unsettledExpenses && Array.isArray(unsettledExpenses) && unsettledExpenses.length > 0) {
      console.log(`Processing ${unsettledExpenses.length} unsettled expenses`);

      for (const expense of unsettledExpenses as UnsettledExpenseInput[]) {
        try {
          // Validate category selection
          if (!expense.categoryId) {
            console.error(`Skipping expense ${expense.splitwiseTransactionId}: Missing category`);
            continue;
          }

          // Convert date to timestamp
          const expenseDate = new Date(expense.date).getTime();
          
          // Create transaction for the expense
          const createTransactionSql = `
            INSERT INTO Transactions 
            (AMOUNT, DATE, NOTES, FROM_ACCOUNT_ID, CATEGORY_ID, SUB_CATEGORY_ID, TRANSCATION_TYPE) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          const transactionResult = await query(createTransactionSql, [
            expense.splitedAmount,
            expenseDate,
            expense.description,
            accountId, // FROM_ACCOUNT_ID for expense
            expense.categoryId,
            expense.subCategoryId,
            TransactionType.EXPENSE
          ]);

          console.log(`Created transaction ID: ${transactionResult.insertId} for Splitwise expense ${expense.splitwiseTransactionId}`);

          // delete SplitwiseTransactions 
          await query(
            `DELETE from SplitwiseTransactions 
             WHERE SPLITWISE_TRANSACTION_ID = ? AND FRIEND_ID = ?`,
            [expense.splitwiseTransactionId, friendDbId]
          );

          console.log(`Deleted SplitwiseTransactions for expense ${expense.splitwiseTransactionId}`);

          offsetEntries.push({
            id: transactionResult.insertId,
            splitwiseTransactionId: expense.splitwiseTransactionId,
            amount: expense.splitedAmount,
            description: expense.description,
            type: 'unsettled',
          });

        } catch (error) {
          console.error(`Error processing unsettled expense ${expense.splitwiseTransactionId}:`, error);
        }
      }
    }

    // Fetch previously settled transactions for this friend (where TRANSACTION_ID is not null)
    // If settledTransactionIds provided, only fetch those specific transactions
    const hasSpecificIds = Array.isArray(settledTransactionIds) && settledTransactionIds.length > 0;
    const fetchTransactionsSql = hasSpecificIds
      ? `
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
      WHERE st.FRIEND_ID = ? AND st.TRANSACTION_ID IN (${settledTransactionIds.map(() => '?').join(',')})
      ORDER BY t.DATE ASC
    `
      : `
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
    }>(fetchTransactionsSql, hasSpecificIds ? [friendDbId, ...settledTransactionIds.map((id: string) => parseInt(id))] : [friendDbId]);

    console.log(`Found ${transactions.length} settled transactions for friend ID ${friendDbId}`);

    if (transactions.length > 0) {
      friendName = transactions[0].FRIEND_NAME;

      // Process each transaction and create offsetting entry
      for (const tx of transactions) {
        try {
          const settlementAmount = tx.SPLITED_AMOUNT;
          const description = tx.NOTES || 'Splitwise expense';

          // Create offsetting settlement entry (negative amount = income/settlement)
          const settlementSql = `
            INSERT INTO Transactions 
            (AMOUNT, DATE, NOTES, FROM_ACCOUNT_ID, CATEGORY_ID, SUB_CATEGORY_ID, TRANSCATION_TYPE) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          const settlementResult = await query(settlementSql, [
            -Math.abs(settlementAmount), // Negative amount = settlement received (income)
            tx.DATE,
            `Settlement from: ${friendName} - ${description}`,
            accountId, // Money received in this bank account (TO_ACCOUNT_ID for income)
            tx.CATEGORY_ID,
            tx.SUB_CATEGORY_ID,
            TransactionType.EXPENSE
          ]);

          console.log(`Created settlement transaction ID: ${settlementResult.insertId}`);

          // Delete the Splitwise transaction entry
          await query(
            `DELETE FROM SplitwiseTransactions WHERE TRANSACTION_ID = ? AND FRIEND_ID = ?`,
            [tx.TRANSACTION_ID, friendDbId]
          );
          console.log(`Deleted transaction ${tx.TRANSACTION_ID} for friend ID ${friendDbId} from SplitwiseTransactions`);

          offsetEntries.push({
            // id: settlementResult.insertId,
            id:1,
            originalTransactionId: tx.TRANSACTION_ID,
            splitwiseTransactionId: tx.SPLITWISE_TX_ID,
            amount: -settlementAmount,
            description: `Settlement from: ${friendName}`,
            type: 'settled',
          });

        } catch (error) {
          console.error(`Error creating settlement for transaction ${tx.TRANSACTION_ID}:`, error);
          // Continue with other transactions even if one fails
        }
      }
    }

    const message = offsetEntries.length > 0 
      ? `Successfully processed ${offsetEntries.length} transaction(s) for ${friendName}`
      : `No transactions to process for ${friendName}`;

    return NextResponse.json({
      success: true,
      message,
      offsetEntries,
    });

  } catch (error) {
    console.error('Error creating settlement entries:', error);
    return NextResponse.json({ 
      error: 'Failed to create settlement entries' 
    }, { status: 500 });
  }
}
