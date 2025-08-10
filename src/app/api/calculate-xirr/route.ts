
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import xirr from 'xirr';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const INVESTMENT_TRANS_DB_ID = process.env.INVESTMENT_TRANS_DB_ID;
const INVESTMENT_ACCOUNTS_DB_ID = process.env.INVESTMENT_DB_ID;

// Helper to fetch all pages from a paginated Notion API endpoint
async function getAllPages(query: any) {
    let results: any[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
        const response: any = await notion.databases.query({
            ...query,
            start_cursor: startCursor,
        });
        results = results.concat(response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
    }
    return results;
}

export async function POST(request: NextRequest) {
    if (!INVESTMENT_TRANS_DB_ID || !INVESTMENT_ACCOUNTS_DB_ID) {
        return NextResponse.json({ error: 'Investment database IDs are not configured.' }, { status: 500 });
    }
    if (!process.env.NOTION_API_KEY) {
        return NextResponse.json({ error: 'Notion API key is not configured.' }, { status: 500 });
    }

    try {
        const { investmentAccountId } = await request.json();

        if (!investmentAccountId) {
            return NextResponse.json({ error: 'Investment Account ID is required.' }, { status: 400 });
        }

        // 1. Fetch all transactions for the given account
        const transactionPages = await getAllPages({
            database_id: INVESTMENT_TRANS_DB_ID,
            filter: {
                property: 'Invested Account',
                relation: {
                    contains: investmentAccountId,
                },
            },
            sorts: [
                {
                    property: 'Investment Date',
                    direction: 'ascending',
                }
            ]
        });

        const transactions = transactionPages.map((page: any) => ({
            amount: -Math.abs(page.properties['Invested Amount']?.number || 0), // Investments are cash outflows
            when: new Date(page.properties['Investment Date']?.date?.start),
        }));

        if (transactions.length < 2) {
             return NextResponse.json({ error: 'At least two transactions are required to calculate XIRR.' }, { status: 400 });
        }

        // 2. Fetch the current value of the investment account
        const accountPage = await notion.pages.retrieve({ page_id: investmentAccountId });
        const currentValue = (accountPage as any).properties?.['Current Value'].number || 0;
        // 3. Add the current value as the final "cash flow" transaction
        transactions.push({
            amount: currentValue, // Current value is a cash inflow
            when: new Date(),
        });
        
        // 4. Calculate XIRR
        // The xirr library can throw an error if it can't find a root
        try {
            const result = xirr(transactions);
            return NextResponse.json({ xirr: result });
        } catch(e) {
            console.error("XIRR calculation error:", e);
            // This error often means no solution could be found, which can happen with unusual cash flows.
            return NextResponse.json({ error: "Could not calculate XIRR. The cash flows may not have a valid rate of return (e.g., all positive or all negative)." }, { status: 400 });
        }

    } catch (error) {
        console.error('Error calculating XIRR:', error);
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }
}
