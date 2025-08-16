'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';

const notion = new Client({ auth: process.env.NOTION_API_WRITE });
const EXPENSES_DB_ID = process.env.EXPENSE_DB_ID;

const paymentSchema = z.object({
  creditCardId: z.string().min(1),
  bankAccountId: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedData = paymentSchema.parse(body);

    if (!EXPENSES_DB_ID) {
      return NextResponse.json({ error: 'Expense database ID is not configured' }, { status: 500 });
    }

    const { creditCardId, bankAccountId, amount, description } = parsedData;

    // Create expense entry for the credit card payment
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Create expense properties for the payment
    const expenseProperties = {
      Date: {
        date: {
          start: currentDate,
        },
      },
      Expense: {
        title: [
          {
            text: {
              content: description || `Credit card payment - ₹${amount}`,
            },
          },
        ],
      },
      Amount: {
        number: amount,
      },
      // Category and subcategory for credit card payments
      "Account Type": {
        select: {
          name: "CC Bill Payment",
        },
      },
      "Bank Account": {
        relation: [
          {
            id: bankAccountId, // The bank account from which money is transferred
          },
        ],
      },
      "Credit Card Account": {
        relation: [
          {
            id: creditCardId, // The credit card used for the payment
          },
        ],
      },
    };
    // Create the expense entry
    const expenseResult = await notion.pages.create({
      parent: { database_id: EXPENSES_DB_ID },
      properties: expenseProperties,
    });

    // Here you might also want to update the credit card and bank account balances
    // This depends on how your system tracks balances - whether in Notion or separately

    return NextResponse.json({
      success: true,
      message: 'Credit card payment processed successfully',
      transactionId: expenseResult.id,
      expenseEntry: expenseResult,
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
