
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';

const notion = new Client({ auth: process.env.NOTION_API_WRITE });
const INVESTMENT_TRANS_DB_ID = process.env.INVESTMENT_TRANS_DB_ID;

const addInvestmentSchema = z.object({
  amount: z.number(),
  date: z.string(), // ISO date string
  description: z.string(),
  accountId: z.string(), // ID of the bank account it was paid from
  investmentCategoryId: z.string(), // ID of the investment account it was paid into
});


export async function POST(request: NextRequest) {
    if (!INVESTMENT_TRANS_DB_ID) {
        return NextResponse.json({ error: 'Investment transaction database ID is not configured.' }, { status: 500 });
    }
    if (!process.env.NOTION_API_KEY) {
        return NextResponse.json({ error: 'Notion API key is not configured.' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const parsedData = addInvestmentSchema.parse(body);

        const { amount, date, description, accountId, investmentCategoryId } = parsedData;

        const properties: any = {
            'Description': {
                title: [{ text: { content: description } }]
            },
            'Invested Amount': {
                number: amount
            },
            'Investment Date': {
                date: { start: date }
            },
            'Bank Account': { // Relation to the source bank account
                relation: [{ id: accountId }]
            },
            'Invested Account': { // Relation to the destination investment account
                relation: [{ id: investmentCategoryId }]
            },
            "Type": {
                select: {name: "Invest"}
            }
        };

        await notion.pages.create({
            parent: { database_id: INVESTMENT_TRANS_DB_ID },
            properties: properties,
        });

        return NextResponse.json({ success: true, message: 'Investment added to Notion.' });

    } catch (error) {
        console.error('Error adding investment to Notion:', error);
        if (error instanceof z.ZodError) {
             return NextResponse.json({ error: 'Invalid data provided.', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }
}