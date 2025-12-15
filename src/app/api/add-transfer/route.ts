'use server';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, TransactionType } from '@/lib/db';

const transferSchema = z.object({
  fromAccountId: z.number().positive(),
  toAccountId: z.number().positive(),
  amount: z.number().positive(),
  date: z.number().positive(), // Epoch timestamp
  reason: z.string().min(1),
}).refine(
  (data) => data.fromAccountId !== data.toAccountId,
  {
    message: 'Source and destination accounts must be different.',
  }
);

async function createTransferTransaction(
  fromAccountId: number,
  toAccountId: number,
  amount: number,
  date: number,
  reason: string
): Promise<number> {
  const result = await query(
    `INSERT INTO Transactions 
     (AMOUNT, DATE, NOTES, FROM_ACCOUNT_ID, TO_ACCOUNT_ID, TRANSCATION_TYPE) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      amount,
      date,
      reason,
      fromAccountId,
      toAccountId,
      TransactionType.TRANSFER
    ]
  );
  
  console.log('Transfer transaction created with ID:', result.insertId);
  return result.insertId as number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedData = transferSchema.parse(body);

    const { fromAccountId, toAccountId, amount, date, reason } = parsedData;

    // Verify both accounts exist and are bank accounts
    const accountsSql = `
      SELECT ID, ACCOUNT_NAME, CURRENT_BALANCE, ACCOUNT_TYPE 
      FROM Accounts 
      WHERE ID IN (?, ?) AND ACCOUNT_TYPE = 1 AND IS_ACTIVE = 1
    `;
    const accounts: any[] = await query(accountsSql, [fromAccountId, toAccountId]);

    if (accounts.length !== 2) {
      return NextResponse.json({ 
        error: 'Both accounts must exist and be active bank accounts' 
      }, { status: 400 });
    }

    const fromAccount = accounts.find(acc => acc.ID === fromAccountId);
    
    // Optional: Check if source account has sufficient balance
    if (fromAccount && fromAccount.CURRENT_BALANCE < amount) {
      return NextResponse.json({ 
        error: `Insufficient balance in ${fromAccount.ACCOUNT_NAME}. Available: ₹${fromAccount.CURRENT_BALANCE.toLocaleString('en-IN')}` 
      }, { status: 400 });
    }

    const transactionId = await createTransferTransaction(
      fromAccountId,
      toAccountId,
      amount,
      date,
      reason
    );

    return NextResponse.json({
      success: true,
      message: 'Transfer completed successfully',
      transactionId,
    });

  } catch (error) {
    console.error('Error processing transfer:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: 'Invalid data provided', 
        details: error.errors 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      error: 'Failed to process transfer' 
    }, { status: 500 });
  }
}
