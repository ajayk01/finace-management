
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, TransactionType } from '@/lib/db';

/**
 * Create income transaction in database
 */
async function createIncomeTransaction({ 
    amount, 
    date, 
    description, 
    account, 
    categoryId, 
    subCategoryId 
}: {
    amount: number;
    date: string;
    description: string;
    account: { id: string; type: 'Bank' | 'Credit Card' };
    categoryId: string;
    subCategoryId?: string;
}): Promise<number> {
    // Convert date string (YYYY-MM-DD) to epoch time (Unix timestamp in milliseconds, like Java System.currentTimeMillis())
    const epochTime = new Date(date).getTime();
    
    const sql = `
        INSERT INTO Transactions (
            DATE, 
            NOTES, 
            AMOUNT, 
            TO_ACCOUNT_ID, 
            CATEGORY_ID, 
            SUB_CATEGORY_ID, 
            TRANSCATION_TYPE
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result: any = await query(sql, [
        epochTime,
        description,
        amount,
        parseInt(account.id),
        parseInt(categoryId),
        subCategoryId ? parseInt(subCategoryId) : null,
        TransactionType.INCOME
    ]);
    
    // Extract the inserted ID from the result
    const insertedId = result?.insertId || result?.[0]?.insertId || 0;
    
    console.log(`✅ Created income transaction with ID: ${insertedId}, date: ${date} (epoch: ${epochTime})`);
    return insertedId;
}

const addIncomeSchema = z.object({
  amount: z.number(),
  date: z.string(), // ISO date string
  description: z.string(),
  account: z.object({
      id: z.string(),
      type: z.enum(['Bank', 'Credit Card']),
  }),
  categoryId: z.string(),
  subCategoryId: z.string().optional(),
});


export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsedData = addIncomeSchema.parse(body);

        const { amount, date, description, account, categoryId, subCategoryId } = parsedData;

        // Create income transaction in database
        const transactionId = await createIncomeTransaction({
            amount, 
            date, 
            description, 
            account, 
            categoryId, 
            subCategoryId
        });

        return NextResponse.json({ 
            success: true, 
            message: 'Income added successfully.',
            transactionId
        });

    } catch (error) {
        console.error('Error adding income:', error);
        if (error instanceof z.ZodError) {
             return NextResponse.json({ error: 'Invalid data provided.', details: error.errors }, { status: 400 });
        }
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }
}