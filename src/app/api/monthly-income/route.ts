
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';
import { fetchAllPagesFromNotion } from '@/lib/notion-helpers';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const INCOME_DB_ID = process.env.INCOME_DB_ID;
const INC_SUB_CATEGORY_DB_ID = process.env.INC_SUB_CATEGORY_DB_ID;
const INC_CATEGORY_DB_ID = process.env.INC_CATEGORY_DB_ID;

const categoryCache: Map<string, string> = new Map();
const subCategoryCache: Map<string, string> = new Map();
const subCategoryToCategoryMap: Map<string, string> = new Map(); // Maps subcategory ID to category ID

interface IncomeTransaction {
  id: string;
  date: string | null;
  description: string;
  amount: number;
  type: 'Income';
  category?: string;
  subCategory?: string;
}

interface IncomeItem 
{
  year: number;
  month: string;
  category: string;
  subCategory: string;
  expense: string; // Using "expense" to match the generic table component prop
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
  if (!INC_CATEGORY_DB_ID || categoryCache.size > 0) return;
  const results = await fetchAllPagesFromNotion(notion, INC_CATEGORY_DB_ID);
  results.forEach((page: any) => 
  {
    const id = page.id;
    const name = page.properties["Category"]?.title?.[0]?.plain_text;
    if (id && name) categoryCache.set(id, name);
  });
}

async function loadSubCategoryCache() 
{
  if (!INC_SUB_CATEGORY_DB_ID || subCategoryCache.size > 0) return;
  const results = await fetchAllPagesFromNotion(notion, INC_SUB_CATEGORY_DB_ID);
  results.forEach((page: any) => 
  {
    const id = page.id;
    const name = page.properties["Sub Category"]?.title?.[0]?.plain_text;
    const categoryId = page.properties["Category"]?.relation?.[0]?.id;
    if (id && name) {
        subCategoryCache.set(id, name);
        if (categoryId) {
            subCategoryToCategoryMap.set(id, categoryId);
        }
    }
  });
}

async function fetchMonthlyIncomeFromNotion({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<IncomeTransaction[]> {
  if (!INCOME_DB_ID) {
    throw new Error("INCOME_DB_ID is not set in environment variables.");
  }

  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const from = formatDateToDDMMYYYY(startDate);
    const to = formatDateToDDMMYYYY(endDate);
    const filters: any = { and: [] };
      filters.and.push({
        property: "Date",
        date: { on_or_after: from }
      });
      filters.and.push({
        property: "Date",
        date: { on_or_before: to }
      });

    await Promise.all([loadCategoryCache(), loadSubCategoryCache()]);

    const results = await fetchAllPagesFromNotion(notion, INCOME_DB_ID, { filter: filters });

    const items = await Promise.all(
      results.map(async (page:any) => {
        const prop = page.properties;
        const amount = Number(prop["Amount"]?.number);
        if (amount === 0) return null;
        
        const description = prop['Description']?.title?.[0]?.plain_text || 'No Description';
        const date = prop['Date']?.date?.start || null;
        
        const categoryId = prop["Category"]?.relation?.[0]?.id;
        const subCategoryId = prop["Sub Category"]?.relation?.[0]?.id;
        
        const categoryName = categoryId ? categoryCache.get(categoryId) : "Uncategorized";
        const subCategoryName = subCategoryId ? subCategoryCache.get(subCategoryId) : "";

        return {
          id: page.id,
          date,
          description,
          amount,
          type: 'Income',
          category: categoryName,
          subCategory: subCategoryName,
        } as IncomeTransaction;
      })
    );

    return items.filter(Boolean) as IncomeTransaction[];
  } catch (error) {
    console.error("Error fetching income from Notion:", error);
    throw new Error("Failed to fetch income from Notion.");
  }
}

function groupTransactions(transactions: IncomeTransaction[], month: string, year: number): IncomeItem[] {
    const groupedMap: Record<string, Record<string, number>> = {};

    transactions.forEach(({ category, subCategory, amount }) => {
      const cat = category || 'Uncategorized';
      const sub = subCategory || 'Uncategorized';
      if (!groupedMap[cat]) groupedMap[cat] = {};
      if (!groupedMap[cat][sub]) groupedMap[cat][sub] = 0;
      groupedMap[cat][sub] += amount;
    });

    const groupedArray: IncomeItem[] = Object.entries(groupedMap).flatMap(
      ([category, subMap]) =>
        Object.entries(subMap).map(([subCategory, total]) => ({
          year: Number(year),
          month: String(month),
          category,
          subCategory,
          expense: `₹${total}` // Key is 'expense' to match generic component
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

    await Promise.all([loadCategoryCache(), loadSubCategoryCache()]);
    
    const rawTransactions = await fetchMonthlyIncomeFromNotion({ month, year });
    const monthlyIncome = groupTransactions(rawTransactions, month, Number(year));
    
    rawTransactions.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    const categories = Array.from(categoryCache.entries()).map(([id, name]) => ({ id, name }));
    const subCategories = Array.from(subCategoryCache.entries()).map(([id, name]) => {
      const categoryId = subCategoryToCategoryMap.get(id) || '';
      return { id, name, categoryId };
    });

    return NextResponse.json({
      monthlyIncome,
      rawTransactions,
      categories,
      subCategories,
    });
  } catch (error) {
    console.error("Error in /api/monthly-income:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching income details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
export { getFromToDates, formatDateToDDMMYYYY };
export type { IncomeItem };
