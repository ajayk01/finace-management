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
    const { friendId, bankAccountId, unsettledExpenses, settledTransactionIds, date, totalSettlementAmount: clientTotal } = await request.json();
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

    // Use provided date or current date/time
    const settledDate = date || Date.now();

    // Collect all splits to process
    const allSplitsToProcess: Array<{
      splitwiseTransactionId: string;
      splitedAmount: number;
      splitedTransactionId: number | null;
      description: string;
      categoryId: number | null;
      subCategoryId: number | null;
      transactionId: number | null;
      type: 'unsettled' | 'settled';
    }> = [];

    // 1. Gather unsettled expenses (from Splitwise sync - TRANSACTION_ID IS NULL)
    if (unsettledExpenses && Array.isArray(unsettledExpenses) && unsettledExpenses.length > 0) {
      console.log(`Processing ${unsettledExpenses.length} unsettled expenses`);

      for (const expense of unsettledExpenses as UnsettledExpenseInput[]) 
      {
        if (!expense.categoryId) 
        {
          console.error(`Skipping expense ${expense.splitwiseTransactionId}: Missing category`);
          continue;
        }

        // Get the SPLITED_TRANSACTION_ID from SplitwiseTransactions
        const stResult = await query<{ SPLITED_TRANSACTION_ID: number | null }>(
          `SELECT SPLITED_TRANSACTION_ID FROM SplitwiseTransactions 
           WHERE SPLITWISE_TRANSACTION_ID = ? AND FRIEND_ID = ?`,
          [expense.splitwiseTransactionId, friendDbId]
        );

        const parsedAmount = parseFloat(String(expense.splitedAmount)) || 0;

        allSplitsToProcess.push({
          splitwiseTransactionId: expense.splitwiseTransactionId,
          splitedAmount: parsedAmount,
          splitedTransactionId: stResult.length > 0 ? stResult[0].SPLITED_TRANSACTION_ID : null,
          description: expense.description,
          categoryId: expense.categoryId,
          subCategoryId: expense.subCategoryId,
          transactionId: null,
          type: 'unsettled',
        });
      }
    }

    // 2. Gather settled transactions (where TRANSACTION_ID is not null - user already paid)
    const hasSpecificIds = Array.isArray(settledTransactionIds) && settledTransactionIds.length > 0;
    const fetchTransactionsSql = hasSpecificIds
      ? `
      SELECT 
        st.SPLITWISE_TRANSACTION_ID as SPLITWISE_TX_ID,
        st.TRANSACTION_ID,
        st.SPLITED_AMOUNT,
        st.SPLITED_TRANSACTION_ID,
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
        st.SPLITED_TRANSACTION_ID,
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
      SPLITED_TRANSACTION_ID: number | null;
      DATE: number;
      NOTES: string;
      CATEGORY_ID: number | null;
      SUB_CATEGORY_ID: number | null;
      FRIEND_NAME: string;
    }>(fetchTransactionsSql, hasSpecificIds ? [friendDbId, ...settledTransactionIds.map((id: string) => parseInt(id))] : [friendDbId]);

    console.log(`Found ${transactions.length} settled transactions for friend ID ${friendDbId}`);

    if (transactions.length > 0) {
      friendName = transactions[0].FRIEND_NAME;

      for (const tx of transactions) {
        const parsedTxAmount = parseFloat(String(tx.SPLITED_AMOUNT)) || 0;

        allSplitsToProcess.push({
          splitwiseTransactionId: tx.SPLITWISE_TX_ID.toString(),
          splitedAmount: parsedTxAmount,
          splitedTransactionId: tx.SPLITED_TRANSACTION_ID,
          description: tx.NOTES || 'Splitwise expense',
          categoryId: tx.CATEGORY_ID,
          subCategoryId: tx.SUB_CATEGORY_ID,
          transactionId: tx.TRANSACTION_ID,
          type: 'settled',
        });
      }
    }

    // Use client-provided settlement amount (settled - unsettled)
    const finalSettlementAmount = parseFloat(String(clientTotal)) || 0;
    console.log(`Settlement amount from client: ${finalSettlementAmount}`);

    // 3. Create ONE settlement transaction for the total amount at the settlement date
    if (finalSettlementAmount !== 0) {
      const appTransactionIds = allSplitsToProcess.map(s => s.splitedTransactionId).filter(Boolean).join(', ');
      const settlementSql = `
        INSERT INTO Transactions 
        (AMOUNT, DATE, NOTES, FROM_ACCOUNT_ID, CATEGORY_ID, SUB_CATEGORY_ID, TRANSCATION_TYPE) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      const settlementResult = await query(settlementSql, [
        -finalSettlementAmount,
        settledDate,
        `Settlement : ${friendName} [${appTransactionIds}]`,
        accountId,
        null, // No single category for combined settlement
        null,
        TransactionType.EXPENSE
      ]);

      console.log(`✅ Created ONE settlement transaction ID: ${settlementResult.insertId} for total ₹${finalSettlementAmount}`);

      offsetEntries.push({
        id: settlementResult.insertId,
        amount: finalSettlementAmount,
        description: `Settlement with ${friendName}`,
        type: 'settlement',
      });
    }

    // 4. For each split, update the dummy transaction (ADD split amount) and clean up SplitwiseTransactions
    for (const split of allSplitsToProcess) {
      try {
        if (split.splitedTransactionId) {
          // UPDATE the dummy transaction: ADD split amount to current amount, update notes
          const updateSql = `
            UPDATE Transactions 
            SET AMOUNT = AMOUNT - ?, 
                NOTES = CASE WHEN NOTES IS NULL OR NOTES = '' THEN CONCAT(?, ' : ', ?) ELSE CONCAT(NOTES, ', ', ?) END,
                CATEGORY_ID = COALESCE(CATEGORY_ID, ?),
                SUB_CATEGORY_ID = COALESCE(SUB_CATEGORY_ID, ?)
            WHERE ID = ?
          `;

          await query(updateSql, [
            split.splitedAmount,
            split.splitwiseTransactionId,
            friendName,
            friendName,
            split.categoryId,
            split.subCategoryId,
            split.splitedTransactionId
          ]);
          console.log("sql was"+updateSql);
          console.log(`Updated dummy tx ${split.splitedTransactionId}: added ₹${split.splitedAmount} for ${friendName}`);
        }

        // Delete SplitwiseTransactions row
        if (split.type === 'unsettled') {
          await query(
            `DELETE FROM SplitwiseTransactions 
             WHERE SPLITWISE_TRANSACTION_ID = ? AND FRIEND_ID = ?`,
            [split.splitwiseTransactionId, friendDbId]
          );
        } else {
          await query(
            `DELETE FROM SplitwiseTransactions WHERE TRANSACTION_ID = ? AND FRIEND_ID = ?`,
            [split.transactionId, friendDbId]
          );
        }

        console.log(`Deleted SplitwiseTransactions for ${split.splitwiseTransactionId}`);

        offsetEntries.push({
          splitwiseTransactionId: split.splitwiseTransactionId,
          dummyTransactionId: split.splitedTransactionId,
          amount: split.splitedAmount,
          description: split.description,
          type: split.type,
        });

      } catch (error) {
        console.error(`Error processing split ${split.splitwiseTransactionId}:`, error);
      }
    }

    const message = allSplitsToProcess.length > 0 
      ? `Successfully settled ${allSplitsToProcess.length} transaction(s) for ${friendName} (₹${finalSettlementAmount})`
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
