
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, TransactionType } from '@/lib/db';

const addInvestmentSchema = z.object({
  amount: z.number(),
  date: z.string(), // ISO date string
  description: z.string(),
  accountId: z.string(), // ID of the bank account it was paid from
  investmentAccountId: z.string(), // ID of the investment account it was paid into
});

async function createInvestmentTransaction(
  amount: number,
  date: string,
  description: string,
  accountId: string,
  investmentCategoryId: string
): Promise<number> {
  const epochTime = new Date(date).getTime();
  
  const result = await query(
    `INSERT INTO Transactions 
     (AMOUNT, DATE, NOTES, FROM_ACCOUNT_ID, TO_ACCOUNT_ID, TRANSCATION_TYPE) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [amount, epochTime, description, parseInt(accountId), parseInt(investmentCategoryId), TransactionType.INVESTMENT]
  );
  
  console.log('Investment transaction created with ID:', result.insertId);
  return result.insertId as number;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsedData = addInvestmentSchema.parse(body);

        const { amount, date, description, accountId, investmentAccountId } = parsedData;
        console.log('Adding investment with data:', parsedData);
        const transactionId = await createInvestmentTransaction(
            amount,
            date,
            description,
            accountId,
            investmentAccountId
        );

        return NextResponse.json({ 
            success: true, 
            message: 'Investment added successfully.',
            transactionId 
        });

    } catch (error) {
        console.error('Error adding investment:', error);
        if (error instanceof z.ZodError) {
             return NextResponse.json({ error: 'Invalid data provided.', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }
}

const updateInvestmentSchema = z.object({
  id: z.string(),
  amount: z.number(),
  date: z.string(),
  description: z.string().optional(),
  accountId: z.string(),
  investmentAccountId: z.string(),
});

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const parsedData = updateInvestmentSchema.parse(body);
        const { id, amount, date, description, accountId, investmentAccountId } = parsedData;

        const epochTime = new Date(date).getTime();

        const sql = `
            UPDATE Transactions 
            SET DATE = ?,
                NOTES = ?,
                AMOUNT = ?,
                FROM_ACCOUNT_ID = ?,
                TO_ACCOUNT_ID = ?
            WHERE ID = ? AND TRANSCATION_TYPE = ?
        `;

        await query(sql, [
            epochTime,
            description || '',
            amount,
            parseInt(accountId),
            parseInt(investmentAccountId),
            parseInt(id),
            TransactionType.INVESTMENT
        ]);

        return NextResponse.json({ 
            success: true, 
            message: 'Investment updated successfully.'
        });
    } catch (error) {
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        } else {
            return NextResponse.json({ error: String(error) }, { status: 500 });
        }
    }
}
