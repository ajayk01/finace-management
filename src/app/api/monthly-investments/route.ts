
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const INVESTMENT_TRANS_DB_ID = process.env.INVESTMENT_TRANS_DB_ID;
const INVESTMENT_ACCOUNTS_DB_ID = process.env.INVESTMENT_DB_ID;

const investmentAccountCache: Map<string, string> = new Map();

// Interfaces for data structures
interface Transaction {
    id: string;
    date: string | null;
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

function formatDateToDDMMYYYY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
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

async function fetchMonthlyInvestmentsFromNotion({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<Transaction[]> {
  if (!INVESTMENT_TRANS_DB_ID) {
    throw new Error("INVESTMENT_TRANS_DB_ID is not set in environment variables.");
  }

  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const from = formatDateToDDMMYYYY(startDate);
    const to = formatDateToDDMMYYYY(endDate);
    
    const filters: any = { and: [] };
    filters.and.push({
      property: "Investment Date",
      date: { on_or_after: from }
    });
    filters.and.push({
      property: "Investment Date",
      date: { on_or_before: to }
    });

    await loadInvestmentAccountCache();

    const response = await notion.databases.query({
      database_id: INVESTMENT_TRANS_DB_ID,
      filter: filters
    });

    const items = await Promise.all(
      response.results.map(async (page: any) => {
        const prop = (page as any).properties;

        const amount = Number(prop["Invested Amount"]?.number) || 0;
        if (amount === 0) return null;

        const description = prop['Description']?.title?.[0]?.plain_text || 'No Description';
        const date = prop['Investment Date']?.date?.start || null;
        
        const investmentAccountId = prop["Invested Account"]?.relation?.[0]?.id;
        const categoryName = investmentAccountId ? investmentAccountCache.get(investmentAccountId) : "Uncategorized";

        return {
          id: page.id,
          date,
          description,
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

function groupTransactions(transactions: Transaction[], month: string, year: number): ExpenseItem[] {
    const groupedMap: Record<string, Record<string, number>> = {};

    transactions.forEach(({ category, subCategory, amount }) => {
      const cat = category || 'Uncategorized';
      const sub = subCategory || ''; // Not used for investments but kept for structure
      if (!groupedMap[cat]) groupedMap[cat] = {};
      if (!groupedMap[cat][sub]) groupedMap[cat][sub] = 0;
      groupedMap[cat][sub] += amount;
    });

    return Object.entries(groupedMap).flatMap(
      ([category, subMap]) =>
        Object.entries(subMap).map(([subCategory, total]) => ({
          year: Number(year),
          month: String(month),
          category,
          subCategory,
          expense: `₹${total.toFixed(2)}`
        }))
    );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    if (!process.env.NOTION_API_KEY) {
      return NextResponse.json({ error: "Notion API key is not configured." }, { status: 500 });
    }
    if (!month || !year) {
        return NextResponse.json({ error: "Month and year are required query parameters." }, { status: 400 });
    }

    await loadInvestmentAccountCache();
    
    const rawTransactions = await fetchMonthlyInvestmentsFromNotion({ month, year });
    const monthlyInvestments = groupTransactions(rawTransactions, month, Number(year));
    
    rawTransactions.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    const investmentAccounts = Array.from(investmentAccountCache.entries()).map(([id, name]) => ({ id, name }));

    return NextResponse.json({
      monthlyInvestments,
      rawTransactions,
      investmentAccounts,
    });
  } catch (error) {
    console.error("Error in /api/monthly-investment:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching investment details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}