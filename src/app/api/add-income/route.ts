
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';

const notion = new Client({ auth: process.env.NOTION_API_WRITE });
const INCOME_DB_ID = process.env.INCOME_DB_ID;

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
    if (!INCOME_DB_ID) {
        return NextResponse.json({ error: 'Income database ID is not configured.' }, { status: 500 });
    }
    if (!process.env.NOTION_API_KEY) {
        return NextResponse.json({ error: 'Notion API key is not configured.' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const parsedData = addIncomeSchema.parse(body);

        const { amount, date, description, account, categoryId, subCategoryId } = parsedData;

        const properties: any = {
            'Description': {
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
        
        // In Notion, both bank and credit card might be linked via the same 'Accounts' relation
        if (account.type === 'Bank')
        {
            properties["Account Type"] = { select: { name: 'Bank Account' }};
            properties["Accounts"] = { relation: [{ id: account.id }] };
        }
        else if(account.type === 'Credit Card') 
        {
            properties["Account Type"] = { select: { name: 'Credit Card' } };
            properties["Credit Card Account"] = { relation: [{ id: account.id }] };
        }

        if (subCategoryId) {
            properties['Sub Category'] = { relation: [{ id: subCategoryId }] };
        }


        await notion.pages.create({
            parent: { database_id: INCOME_DB_ID },
            properties: properties,
        });

        return NextResponse.json({ success: true, message: 'Income added to Notion.' });

    } catch (error) {
        console.error('Error adding income to Notion:', error);
        if (error instanceof z.ZodError) {
             return NextResponse.json({ error: 'Invalid data provided.', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }
}