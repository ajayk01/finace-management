
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const EXP_SUB_CATEGORY_DB_ID = "1c570d7fb20b80beaee5c855f75c987f";
const EXPENSE_CATEGORY_DB_ID = "1c570d7fb20b813dbd11e369874aa147";
// const INVESTMENT_DB_ID = process.env.INVESTMENT_DB_ID;
const EXPENSES_DB_ID = process.env.EXPENSE_DB_ID;
const categoryCache: Map<string, string> = new Map();
const subCategoryCache: Map<string, string> = new Map();
// Interfaces for data structures
interface Transaction {
    id: string;
    date: string | null;
    description: string;
    amount: number;
    type: 'Income' | 'Expense' | 'Transfer' | 'Other';
    category?: string;
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

async function loadCategoryCache() 
{
  if (!EXPENSE_CATEGORY_DB_ID) return;
  const response = await notion.databases.query({
    database_id: EXPENSE_CATEGORY_DB_ID,
  });
    response.results.forEach((page: any) => 
    {
    const id = page.id;
    const name = page.properties["Category"]?.title?.[0]?.plain_text;
    categoryCache.set(id, name);
  });
}

async function loadSubCategoryCache() 
{
  if (!EXP_SUB_CATEGORY_DB_ID) return;
  const response = await notion.databases.query({
    database_id: EXP_SUB_CATEGORY_DB_ID,
  });
    response.results.forEach((page: any) => 
    {
    const id = page.id;
    const name = page.properties["Sub Category"]?.title?.[0]?.plain_text;
    subCategoryCache.set(id, name);
  });
}

async function fetchMonthlyExpensesFromNotion({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<Transaction[]> {
  if (!EXPENSES_DB_ID) {
    throw new Error("EXPENSES_DB_ID is not set in environment variables.");
  }

  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const from = formatDateToDDMMYYYY(startDate);
    const to = formatDateToDDMMYYYY(endDate);
    const filters: any = {};
    if (from || to) {
      filters["and"] = [];
      if (from) {
        filters["and"].push({
          property: "Date",
          date: { on_or_after: from }
        });
      }
      if (to) {
        filters["and"].push({
          property: "Date",
          date: { on_or_before: to }
        });
      }
    }
    if(categoryCache.size === 0) 
      {
        console.log("Category cache is empty, loading from Notion...");
        loadCategoryCache();
      }

    if(subCategoryCache.size === 0)
      {
        console.log("Sub Category cache is empty, loading from Notion...");
        loadSubCategoryCache();
      }
    
    const response = await notion.databases.query({
      database_id: EXPENSES_DB_ID,
      ...(filters.and && { filter: filters })
    });

    const items = await Promise.all(
      response.results.map(async (page) => {
        
        
        const prop = (page as any).properties;

        const amount = Number(prop["Amount"]["number"])
        if (amount === 0) return null;
        const description =prop['Expense']['title'][0]?.['plain_text'] || 'No Description';
        const date = prop['Date']?.['date']?.['start'] || null;
        
        let subCategoryId = prop["Sub Category"]["relation"][0]?.["id"]
        let categoryId = prop["Category"]["relation"][0]?.["id"]
        let categoryName = ""
        if(categoryId != undefined) 
        {
          // Check if category is already cached
          categoryName = categoryCache.get(categoryId) ?? "";
         
        }
        let subCategoryName = ""
        if(subCategoryId != undefined)
        {
          subCategoryName = subCategoryCache.get(subCategoryId) ?? "";
         
        }
        if(categoryName == "" && subCategoryName == "")
        {
          return null;
        }
        return {
          id: page.id,
          date: date,
          description: description,
          amount: amount,
          type: 'Expense',
          category: categoryName,
          subCategory: subCategoryName,
        } as Transaction;
      })
    );

    return items.filter(Boolean) as Transaction[];
  } catch (error) {
    console.error("Error fetching expenses from Notion:", error);
    throw new Error("Failed to fetch expenses from Notion.");
  }
}

function groupTransactions(transactions: Transaction[], month: string, year: number): ExpenseItem[] {
    const groupedMap: Record<string, Record<string, number>> = {};

    transactions.forEach(({ category, subCategory, amount }) => {
      const cat = category || 'Uncategorized';
      const sub = subCategory || 'Uncategorized';
      if (!groupedMap[cat]) groupedMap[cat] = {};
      if (!groupedMap[cat][sub]) groupedMap[cat][sub] = 0;
      groupedMap[cat][sub] += amount;
    });

    // Convert to ExpenseItem[]
    const groupedArray: ExpenseItem[] = Object.entries(groupedMap).flatMap(
      ([category, subMap]) =>
        Object.entries(subMap).map(([subCategory, total]) => ({
          year: Number(year),
          month: String(month),
          category,
          subCategory,
          expense: `₹${total}`
        }))
    );

    return groupedArray;
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
    
    const rawTransactions = await fetchMonthlyExpensesFromNotion({ month, year });
    const monthlyExpenses = groupTransactions(rawTransactions, month, Number(year));
    rawTransactions.sort((a, b) => {
          if (!a.date) return -1;
          if (!b.date) return 1;
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
    return NextResponse.json({
      monthlyExpenses,
      rawTransactions,
    });
  } catch (error) {
    console.error("Error in /api/monthly-expense:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching financial details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
export { getFromToDates, formatDateToDDMMYYYY };
export type { ExpenseItem };
