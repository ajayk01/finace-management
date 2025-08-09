
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const INVESTMENT_ACCOUNTS_DB_ID = process.env.INVESTMENT_DB_ID;

const investmentAccountCache: Map<string, string> = new Map();

// Interfaces for data structures
interface Transaction {
    id: string;
    date?: string | null;
    description: string;
    amount: number;
    type: 'Investment';
    category?: string; // Will store the investment account name
    subCategory?: string;
}

interface ExpenseItem {
  year: number;
  month: string;
  category: string;
  subCategory: string;
  expense: string;
}



async function loadInvestmentAccountCache() {
  if (!INVESTMENT_ACCOUNTS_DB_ID || investmentAccountCache.size > 0) return;
  const response = await notion.databases.query({
    database_id: INVESTMENT_ACCOUNTS_DB_ID,
  });
  response.results.forEach((page: any) => {
    const id = page.id;
    const name = page.properties["Investment Account"]?.title?.[0]?.plain_text;
    if (id && name) investmentAccountCache.set(id, name);
  });
}


async function fetchTotalInvestmentsFromNotion({}): Promise<Transaction[]> 
{
  if (!INVESTMENT_ACCOUNTS_DB_ID) {
    throw new Error("INVESTMENT_ACCOUNTS_DB_ID is not set in environment variables.");
  }

  try {
    await loadInvestmentAccountCache();

    const response = await notion.databases.query({
      database_id: INVESTMENT_ACCOUNTS_DB_ID,
    });

    const items = await Promise.all(
      response.results.map(async (page: any) => {
        
        const prop = (page as any).properties;
        const amount = Number(prop["Total invested "]["formula"]["number"]) || 0;
        if (amount === 0) return null;

        const investmentAccountId = page.id;
        const categoryName = investmentAccountId ? investmentAccountCache.get(investmentAccountId) : "Uncategorized";
        return {
          id: page.id,
          amount,
          type: 'Investment',
          category: categoryName,
          subCategory: '', // Investments don't have sub-categories in this model
        } as Transaction;
      })
    );

    return items.filter(Boolean) as Transaction[];
  } catch (error) {
    console.error("Error fetching investments from Notion:", error);
    throw new Error("Failed to fetch investments from Notion.");
  }
}

export async function GET(request: NextRequest) {
try {
    await loadInvestmentAccountCache();
    
    const rawTransactions = await fetchTotalInvestmentsFromNotion({});
    rawTransactions.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    const investmentAccounts = Array.from(investmentAccountCache.entries()).map(([id, name]) => ({ id, name }));

    return NextResponse.json({
      rawTransactions,
      investmentAccounts,
    });
  } catch (error) {
    console.error("Error in /api/monthly-investment:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching investment details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
