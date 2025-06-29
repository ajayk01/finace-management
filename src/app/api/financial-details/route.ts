
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const EXP_SUB_CATEGORY_DB_ID = process.env.EXP_SUB_CATEGORY_DB_ID;
const INC_SUB_CATEGORY_DB_ID = process.env.INC_SUB_CATEGORY_DB_ID;
const INVESTMENT_DB_ID = process.env.INVESTMENT_DB_ID;
const EXPENSES_DB_ID = process.env.EXPENSE_DB_ID;
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

async function fetchGroupedMonthlyExpensesFromNotion({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<ExpenseItem[]> {
  if (!EXPENSES_DB_ID) {
    throw new Error("EXPENSES_DB_ID is not set in environment variables.");
  }

  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const from = formatDateToDDMMYYYY(startDate);
    const to = formatDateToDDMMYYYY(endDate);
    // console.log("From Date : ", from, "To Date : ", to);
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

    const response = await notion.databases.query({
      database_id: EXPENSES_DB_ID,
      ...(filters.and && { filter: filters })
    });

    const items = await Promise.all(
      response.results.map(async (page) => {
        
        
        const prop = (page as any).properties;
        // console.log("Date : ", prop["Date"]["date"]);
        const amount = Number(prop["Amount"]["number"])

        let subCategoryName = ""
        let subCategoryId = prop["Sub Category"]["relation"]
        if(subCategoryId && subCategoryId.length > 0)
        {
            const subCategoryPage = await notion.pages.retrieve({
            page_id: subCategoryId[0]["id"]
          });
          subCategoryName = (subCategoryPage as any).properties["Sub Category"]["title"][0]["plain_text"]
        }
        
        let categoryName = "";
        let categoryId = prop["Category"]["relation"]
        if(categoryId)
        if (categoryId && categoryId.length > 0) {
          const categoryPage = await notion.pages.retrieve({
            page_id: categoryId[0]["id"]
          });

          categoryName = (categoryPage as any).properties["Category"]["title"][0]["plain_text"];
        }
        if(categoryName === "" && subCategoryName === "")
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
// async function fetchMonthlyExpensesFromNotion({ month, year }: { month?: string, year?: string }): Promise<ExpenseItem[]> {
//   console.log("Month : ", month, "Year : ", year);
//   if (!EXPENSES_DB_ID) {
//     throw new Error("EXP_SUB_CATEGORY_DB_ID is not set in environment variables.");
//   }
//   try {
//     const { from, to } = getFromToDates(String(month), Number(year));
//     const filters: any = {};
//     if (from || to) {
//       filters["and"] = [];
//       if (from) {
//         filters["and"].push({
//           property: "Date",
//           date: { on_or_after: from }
//         });
//       }
//       if (to) {
//         filters["and"].push({
//           property: "Date",
//           date: { on_or_before: to }
//         });
//       }
//     }
//     const response = await notion.databases.query({
//       database_id: EXPENSES_DB_ID,
//       ...(filters.and && { filter: filters }),
//     });

//       const items = await Promise.all(response.results.map(async (page) => {
//       const prop = (page as any).properties;
//       console.log("Page Properties : ", prop);
//       const expense = prop["Amount"]["number"]["number"];
//       if(expense == 0)
//       {
//         return null; 
//       }
//       const subCategoryName = prop["Sub Category"]["title"][0]["plain_text"];
//       let categoryName = "";

//       // Await the category page fetch
//       if (prop["Category Name"]?.relation?.[0]?.id) {
//         const categoryPage = await notion.pages.retrieve({ page_id: prop["Category Name"].relation[0].id });
//         categoryName = (categoryPage as any)["properties"]["Category"]["title"][0]["plain_text"];
//       }

//       return {
//         year: 2025,
//         month: 'jun', // Or get from your data
//         category: categoryName,
//         subCategory: subCategoryName || "",
//         expense: `₹${expense}`,
//       };
//     }));

//     return items.filter(item => item !== null) as ExpenseItem[];
//   } catch (error) {
//     console.error("Error fetching monthly expenses from Notion:", error);
//     throw new Error("Failed to fetch monthly expenses from Notion.");
//   }
// }

async function fetchMonthlyIncomesFromNotion(): Promise<ExpenseItem[]> {
  if (!INC_SUB_CATEGORY_DB_ID) {
    throw new Error("EXP_SUB_CATEGORY_DB_ID is not set in environment variables.");
  }
  try {
    const response = await notion.databases.query({
      database_id: INC_SUB_CATEGORY_DB_ID,
      // Add sorts here if needed, e.g., by Year then Month
    });

      const items = await Promise.all(response.results.map(async (page) => {
      const prop = (page as any).properties;
      const expense = prop["Total Incomes"]["formula"]["number"];
      if(expense == 0)
      {
        return null; 
      }
      const subCategoryName = prop["Sub Category"]["title"][0]["plain_text"];
      let categoryName = "";

      // Await the category page fetch
      if (prop["Category"]?.relation?.[0]?.id) {
        const categoryPage = await notion.pages.retrieve({ page_id: prop["Category"].relation[0].id });
        categoryName = (categoryPage as any)["properties"]["Category"]["title"][0]["plain_text"];
      }

      return {
        year: 2025,
        month: 'jun', // Or get from your data
        category: categoryName,
        subCategory: subCategoryName || "",
        expense: `₹${expense}`,
      };
    }));

    return items.filter(item => item !== null) as ExpenseItem[];
  } catch (error) {
    console.error("Error fetching monthly income from Notion:", error);
    throw new Error("Failed to fetch monthly income from Notion.");
  }
}

async function fetchMonthlyInvFromNotion(): Promise<ExpenseItem[]> {
  if (!INVESTMENT_DB_ID) {
    throw new Error("EXP_SUB_CATEGORY_DB_ID is not set in environment variables.");
  }
  try {
    const response = await notion.databases.query({
      database_id: INVESTMENT_DB_ID,
      // Add sorts here if needed, e.g., by Year then Month
    });

      const items = await Promise.all(response.results.map(async (page) => {
      const prop = (page as any).properties;
      const expense = prop["This Month Investments"]["formula"]["number"];
      if(expense == 0)
      {
        return null; 
      }
      //prop["Sub Category"]["title"][0]["plain_text"];
      const categoryName = prop["Investment Account"]["title"][0]["plain_text"] || "";
      return {
        year: 2025,
        month: 'jun', // Or get from your data
        category: categoryName,
        subCategory: "",
        expense: `₹${expense}`,
      };
    }));

    return items.filter(item => item !== null) as ExpenseItem[];
  } catch (error) {
    console.error("Error fetching monthly income from Notion:", error);
    throw new Error("Failed to fetch monthly income from Notion.");
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
    // Check for all required DB IDs
    const requiredDbIds = [
      { name: "EXP_SUB_CATEGORY_DB_ID", value: EXP_SUB_CATEGORY_DB_ID },
      { name: "INC_SUB_CATEGORY_DB_ID", value: INC_SUB_CATEGORY_DB_ID },
      { name: "INVESTMENT_DB_ID", value: INVESTMENT_DB_ID },
    ];

    for (const dbId of requiredDbIds) {
      if (!dbId.value && dbId.name !== "EXP_SUB_CATEGORY_DB_ID") { // EXP_SUB_CATEGORY_DB_ID is an old name, check for new ones
         // Allow specific DBs to be optional if desired by commenting out or conditional logic here
        // For now, all are required
        return NextResponse.json({ error: `${dbId.name} is not configured in environment variables.` }, { status: 500 });
      }
    }
    
    const [
      monthlyExpenses,
      monthlyIncome,
      monthlyInvestments
    ] = await Promise.all([
      fetchGroupedMonthlyExpensesFromNotion({ month: month ?? undefined, year: year ?? undefined }),
      fetchMonthlyIncomesFromNotion(),
      fetchMonthlyInvFromNotion(),
    ]);

    return NextResponse.json({
      monthlyExpenses,
      monthlyIncome,
      monthlyInvestments,
    });
  } catch (error) {
    console.error("Error in /api/financial-details:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching financial details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
export { getFromToDates, formatDateToDDMMYYYY };
export type { ExpenseItem };