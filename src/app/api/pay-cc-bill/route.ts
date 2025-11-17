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

    return NextResponse.json({
      success: true,
      message: 'Credit card payment processed successfully',
      transactionId,
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
