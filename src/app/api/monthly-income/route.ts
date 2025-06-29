
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const INCOME_DB_ID = process.env.INCOME_DB_ID;
const INC_SUB_CATEGORY_DB_ID = process.env.INC_SUB_CATEGORY_DB_ID;
const INC_CATEGORY_DB_ID = process.env.INC_CATEGORY_DB_ID;

const categoryCache: Map<string, string> = new Map();
const subCategoryCache: Map<string, string> = new Map();


interface ExpenseItem 
{
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
  if (!INC_CATEGORY_DB_ID) return;
  const response = await notion.databases.query({
    database_id: INC_CATEGORY_DB_ID,
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
  if (!INC_SUB_CATEGORY_DB_ID) return;
  const response = await notion.databases.query({
    database_id: INC_SUB_CATEGORY_DB_ID,
  });
    response.results.forEach((page: any) => 
    {
    const id = page.id;
    const name = page.properties["Sub Category"]?.title?.[0]?.plain_text;
    subCategoryCache.set(id, name);
  });
}

async function fetchGroupedMonthlyExpensesFromNotion({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<ExpenseItem[]> {
  if (!INCOME_DB_ID) {
    throw new Error("INCOME_DB_ID is not set in environment variables.");
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
      database_id: INCOME_DB_ID,
      ...(filters.and && { filter: filters })
    });

    const items = await Promise.all(
      response.results.map(async (page) => {
        
        
        const prop = (page as any).properties;

        const amount = Number(prop["Amount"]["number"])
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
          //console.log(subCategoryCache)
          subCategoryName = subCategoryCache.get(subCategoryId) ?? "";
         
        }
        if(categoryName == "" && subCategoryName == "")
        {
          return null;
        }
        return {
          category: categoryName,
          subCategory: subCategoryName,
          expense: amount
        };
      })
    );

    // Filter out nulls
    const validItems = items.filter(Boolean) as {
      category: string;
      subCategory: string;
      expense: number;
    }[];

    // Group and sum
    const groupedMap: Record<string, Record<string, number>> = {};

    validItems.forEach(({ category, subCategory, expense }) => {
      if (!groupedMap[category]) groupedMap[category] = {};
      if (!groupedMap[category][subCategory]) groupedMap[category][subCategory] = 0;
      groupedMap[category][subCategory] += expense;
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
  } catch (error) {
    console.error("Error fetching and grouping expenses from Notion:", error);
    throw new Error("Failed to fetch grouped monthly expenses from Notion.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    if (!process.env.NOTION_API_KEY) {
      return NextResponse.json({ error: "Notion API key is not configured." }, { status: 500 });
    }
    
    const [
      monthlyIncome
    ] = await Promise.all([
      fetchGroupedMonthlyExpensesFromNotion({ month: month ?? undefined, year: year ?? undefined })
    ]);

    return NextResponse.json({
      monthlyIncome,
    });
  } catch (error) {
    console.error("Error in /api/monthly-expense:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching financial details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
export { getFromToDates, formatDateToDDMMYYYY };
export type { ExpenseItem };