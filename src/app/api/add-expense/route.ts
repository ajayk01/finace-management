
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const EXPENSES_DB_ID = process.env.EXPENSE_DB_ID;

const addExpenseSchema = z.object({
  amount: z.number(),
  date: z.string(), // ISO date string
  description: z.string(),
  account: z.object({
      id: z.string(),
      type: z.enum(['Bank', 'Credit Card']),
  }),
  categoryId: z.string(),
  subCategoryId: z.string().optional(),
  includeSplitwise: z.boolean().optional(),
  splitwiseGroupId: z.string().optional(),
  splitwiseUserIds: z.array(z.string()).optional(),
  splitwiseGroupName: z.string().optional(),
});


export async function POST(request: NextRequest) {
    // if (!EXPENSES_DB_ID) {
    //     return NextResponse.json({ error: 'Expense database ID is not configured.' }, { status: 500 });
    // }
    // if (!process.env.NOTION_API_KEY) {
    //     return NextResponse.json({ error: 'Notion API key is not configured.' }, { status: 500 });
    // }

    try {
        const body = await request.json();
        const parsedData = addExpenseSchema.parse(body);

        let { amount, date, description, account, categoryId, subCategoryId, includeSplitwise, splitwiseGroupName, splitwiseUserIds } = parsedData;

        const properties: any = {
            'Expense': {
                title: [{ text: { content: description } }]
            },
            'Amount': {
                number: amount
            },
            'Date': {
                date: { start: date }
            },
            'Category': {
                relation: [{ id: categoryId }]
            },
        };
        
        if (account.type === 'Bank') {
            properties['Bank Account'] = { relation: [{ id: account.id }] };
        } else if (account.type === 'Credit Card') {
            properties['Credit Card Account'] = { relation: [{ id: account.id }] };
        }

        if (subCategoryId) {
            properties['Sub Category'] = { relation: [{ id: subCategoryId }] };
        }

        console.log('Adding expense to Notion with properties:', properties);
        console.log('Include Splitwise:', includeSplitwise);
        if (includeSplitwise) {
            console.log('Splitwise Group:', splitwiseGroupName);
            console.log('Splitwise User:', splitwiseUserIds);
        }

        // await notion.pages.create({
        //     parent: { database_id: EXPENSES_DB_ID },
        //     properties: properties,
        // });

        return NextResponse.json({ success: true, message: 'Expense added to Notion.' });

    } catch (error) {
        console.error('Error adding expense to Notion:', error);
        if (error instanceof z.ZodError) {
             return NextResponse.json({ error: 'Invalid data provided.', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }
}