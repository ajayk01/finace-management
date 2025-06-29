
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const EXPENSE_DB_ID = process.env.EXPENSE_DB_ID;
const INCOME_DB_ID = process.env.INCOME_DB_ID;
const INVESTMENT_DB_ID = process.env.INVESTMENT_TRANS_DB_ID;

interface Transaction {
    id: string;
    date: string | null;
    description: string;
    amount: number;
    type: 'Income' | 'Expense' | 'Investment' | 'Other';
}

const monthMap: Record<string, number> = 
{
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
function getFromToDates(month: string, year: number) {
  const monthIndex = monthMap[month.toLowerCase()];

    if (monthIndex === undefined) {
        throw new Error("Invalid month provided. Please use full month names (e.g., 'Jan', 'February').");
    }

    const startDate = new Date(year, monthIndex, 1);
    const endDate = new Date(year, monthIndex + 1, 0);

    return { startDate, endDate };
}

async function fetchFromDatabase(
    databaseId: string | undefined, 
    bankAccountId: string, 
    from: string, 
    to: string, 
    type: Transaction['type'], 
    propertyNames: { date: string, amount: string, description: string, relation: string }
): Promise<Transaction[]> {
    if (!databaseId) {
        // Silently fail if DB ID is not provided
        return [];
    }

    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                and: [
                    {
                        property: propertyNames.relation,
                        relation: {
                            contains: bankAccountId,
                        },
                    },
                    {
                        property: propertyNames.date,
                        date: {
                            on_or_after: from,
                        },
                    },
                    {
                        property: propertyNames.date,
                        date: {
                            on_or_before: to,
                        },
                    }
                ],
            },
        });

        // Use a type guard to filter out any malformed pages before mapping
        return response.results.map((page: any): Transaction => {
            const properties = page.properties;
            // Title properties can have different names, e.g., 'Expense' or 'Name'
            const descriptionProp = properties[propertyNames.description]['title'][0]['plain_text'];
            const amountProp = properties[propertyNames.amount]['number'];
            const dateProp = properties[propertyNames.date]['date']?.['start'] || null;

            return {
                id: page.id,
                date: dateProp,
                description: descriptionProp,
                amount: amountProp,
                type: type,
            };
        });
    } catch (error) {
        console.log(`Error fetching ${type} transactions from Notion (DB ID: ${databaseId}):`, error);
        return []; // Return empty array on error to not fail the entire request
    }
}


export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const bankAccountId = searchParams.get('bankAccountId');
        const month = searchParams.get('month');
        const year = searchParams.get('year');

        if (!process.env.NOTION_API_KEY) {
            return NextResponse.json({ error: "Notion API key is not configured." }, { status: 500 });
        }
        if (!bankAccountId || !month || !year) {
            return NextResponse.json({ error: "bankAccountId, month, and year are required query parameters." }, { status: 400 });
        }

        const { startDate, endDate } = getFromToDates(month, parseInt(year, 10));
        const from = startDate.toISOString().split('T')[0];
        const to = endDate.toISOString().split('T')[0];

        const [expenseTransactions, incomeTransactions, investmentTransactions] = await Promise.all([
            // Fetch Expenses
            fetchFromDatabase(EXPENSE_DB_ID, bankAccountId, from, to, 'Expense', {
                date: 'Date', amount: 'Amount', description: 'Expense', relation: 'Bank Account'
            }),
            // Fetch Incomes
            fetchFromDatabase(INCOME_DB_ID, bankAccountId, from, to, 'Income', {
                date: 'Date', amount: 'Amount', description: 'Description', relation: 'Accounts'
            }),
            // Fetch Investments
            fetchFromDatabase(INVESTMENT_DB_ID, bankAccountId, from, to, 'Investment', {
                date: 'Investment Date', amount: 'Invested Amount', description: 'Description', relation: 'Bank Account'
            })
        ]);
        const allTransactions = [...expenseTransactions, ...incomeTransactions, ...investmentTransactions];
        
        allTransactions.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        return NextResponse.json({ transactions: allTransactions });

    } catch (error) {
        console.error("Error in /api/bank-transactions:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching transactions.";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
