'use server';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, TransactionType } from '@/lib/db';

const paymentSchema = z.object({
  creditCardId: z.string().min(1),
  bankAccountId: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
});

async function createCreditCardPaymentTransaction(
  creditCardId: string,
  bankAccountId: string,
  amount: number,
  description?: string
): Promise<number> {
  const epochTime = Date.now(); // Current timestamp in milliseconds
  const notes = description || `Credit card payment - ₹${amount}`;
  
  const result = await query(
    `INSERT INTO Transactions 
     (AMOUNT, DATE, NOTES, FROM_ACCOUNT_ID, TO_ACCOUNT_ID, TRANSCATION_TYPE) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      amount,
      epochTime,
      notes,
      parseInt(bankAccountId), // FROM: Bank account (money going out)
      parseInt(creditCardId),   // TO: Credit card (money going in to pay bill)
      TransactionType.TRANSFER
    ]
  );
  
  console.log('Credit card payment transaction created with ID:', result.insertId);
  return result.insertId as number;
}

async function resetCapConsumedAmountIfFullPayment(
  creditCardId: string,
  paymentAmount: number
): Promise<boolean> {
  try {
    // Fetch current credit card used amount (CURRENT_BALANCE)
    const ccSql = `SELECT CURRENT_BALANCE FROM Accounts WHERE ID = ? AND ACCOUNT_TYPE = 2`;
    const ccResults = await query<{ CURRENT_BALANCE: number }>(ccSql, [parseInt(creditCardId)]);
    
    if (ccResults.length === 0) 
    {
      console.log(`Credit card ${creditCardId} not found or is not a credit card`);
      return false;
    }
    
    const currentUsedAmount = Math.abs(ccResults[0].CURRENT_BALANCE);
    
    // Check if full amount is being paid
    if (paymentAmount >= currentUsedAmount) {
      // Reset all cap consumed amounts for this credit card
      const resetCapsSql = `
        UPDATE CreditCardCapDetails 
        SET CAP_CURRENT_AMOUNT = 0 
        WHERE CREDIT_CARD_ID = ?
      `;
      await query(resetCapsSql, [parseInt(creditCardId)]);
      console.log(`✅ Reset all cap consumed amounts for credit card ID ${creditCardId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error checking/resetting cap amounts for credit card ${creditCardId}:`, error);
    // Don't throw error - payment should still succeed even if cap reset fails
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedData = paymentSchema.parse(body);

    const { creditCardId, bankAccountId, amount } = parsedData;

    const transactionId = await createCreditCardPaymentTransaction(
      creditCardId,
      bankAccountId,
      amount,
      "CC BILL PAYMENT"
    );

    // Reset cap consumed amount if full amount is being paid
    const capsReset = await resetCapConsumedAmountIfFullPayment(creditCardId, amount);

    return NextResponse.json({
      success: true,
      message: capsReset 
        ? 'Credit card payment processed successfully and caps have been reset'
        : 'Credit card payment processed successfully',
      transactionId,
      capsReset,
    });

  } catch (error) {
    console.error('Error processing credit card payment:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'Invalid data provided', 
        details: error.errors 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      error: 'Failed to process credit card payment' 
    }, { status: 500 });
  }
}
