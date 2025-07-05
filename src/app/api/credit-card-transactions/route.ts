
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const EXPENSE_DB_ID = process.env.EXPENSE_DB_ID;
const INCOME_DB_ID = process.env.INCOME_DB_ID;

interface Transaction {
    id: string;
    date: string | null;
    description: string;
    amount: number;
    type: 'Income' | 'Expense' | 'Investment' | 'Other';
}

async function fetchAllFromDatabase(
    databaseId: string | undefined, 
    filter: any,
    type: Transaction['type'], 
    propertyNames: { date: string, amount: string, description: string }
): Promise<Transaction[]> {
    if (!databaseId) {
        return [];
    }

    const allTransactions: Transaction[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    try {
        while (hasMore) {
            const response = await notion.databases.query({
                database_id: databaseId,
                filter: filter,
                start_cursor: startCursor,
                page_size: 100, // Max page size
            });

            const transactions = response.results.map((page: any): Transaction => {
                const properties = page.properties;
                const descriptionProp = properties[propertyNames.description]?.title[0]?.plain_text || "No description";
                const amountProp = properties[propertyNames.amount]?.number ?? 0;
                const dateProp = properties[propertyNames.date]?.date?.start || null;

                let transactionType = type;
                if (type === 'Expense' && descriptionProp.toLowerCase().includes('cc bill')) {
                    transactionType = 'Income';
                }

                return {
                    id: page.id,
                    date: dateProp,
                    description: descriptionProp,
                    amount: amountProp,
                    type: transactionType,
                };
            });
            allTransactions.push(...transactions);
            
            hasMore = response.has_more;
            startCursor = response.next_cursor ?? undefined;
        }
    } catch (error) {
        console.error(`Error fetching ${type} transactions from Notion (DB ID: ${databaseId}):`, error);
    }
    return allTransactions;
}


export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const creditCardId = searchParams.get('creditCardId');

        if (!process.env.NOTION_API_KEY) {
            return NextResponse.json({ error: "Notion API key is not configured." }, { status: 500 });
        }
        if (!creditCardId) {
            return NextResponse.json({ error: "creditCardId is a required query parameter." }, { status: 400 });
        }

        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const fromDate = twoYearsAgo.toISOString().split('T')[0];
        
        const [expenseTransactions, incomeTransactions] = await Promise.all([
            // Fetch Expenses for the last 2 years
            fetchAllFromDatabase(EXPENSE_DB_ID, {
                and: [
                    { property: 'Credit Card Account', relation: { contains: creditCardId } },
                    { property: 'Date', date: { on_or_after: fromDate } },
                ],
            }, 'Expense', { date: 'Date', amount: 'Amount', description: 'Expense' }),

            // Fetch Incomes for the last 2 years
            fetchAllFromDatabase(INCOME_DB_ID, {
                and: [
                    { property: 'Credit Card Account', relation: { contains: creditCardId } },
                    { property: 'Date', date: { on_or_after: fromDate } },
                ],
            }, 'Income', { date: 'Date', amount: 'Amount', description: 'Description' })
        ]);

        const allTransactions = [...expenseTransactions, ...incomeTransactions];
        
        allTransactions.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        return NextResponse.json({ transactions: allTransactions });

    } catch (error) {
        console.error("Error in /api/credit-card-transactions:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching transactions.";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}