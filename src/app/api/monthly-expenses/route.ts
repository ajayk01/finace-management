
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, TransactionType, CategoryType } from '@/lib/db';
import type { Transaction as DBTransaction, Category as DBCategory, SubCategory as DBSubCategory } from '@/types/database';
// Interfaces for data structures
interface Transaction {
    id: string;
    date: string | null;
    description: string;
    amount: number;
    type: 'Income' | 'Expense' | 'Investment' | 'Transfer' | 'Other';
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

interface Category {
  id: string;
  name: string;
}
interface SubCategory {
  id: string;
  name: string;
  categoryId: string;
}

const monthMap: Record<string, number> = {
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
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
}

async function fetchCategoriesFromDB(): Promise<Category[]> {
  try {
    const sql = `
      SELECT ID, CATEGORY_NAME
      FROM Category
      WHERE CATEGORY_TYPE = ?
      ORDER BY CATEGORY_NAME
    `;
    
    const categories = await query<DBCategory>(sql, [CategoryType.EXPENSE]);
    
    return categories.map((cat: DBCategory) => ({
      id: cat.ID.toString(),
      name: cat.CATEGORY_NAME
    }));
  } catch (error) {
    console.error("Error fetching categories from database:", error);
    throw new Error("Failed to fetch categories from database.");
  }
}

async function fetchSubCategoriesFromDB(): Promise<SubCategory[]> {
  try {
    const sql = `
      SELECT sc.ID, sc.SUB_CATEGORY_NAME, sc.CATEGORY_ID
      FROM SubCategory sc
      JOIN Category c ON sc.CATEGORY_ID = c.ID
      WHERE c.CATEGORY_TYPE = ?
      ORDER BY sc.SUB_CATEGORY_NAME
    `;
    
    const subCategories = await query<DBSubCategory>(sql, [CategoryType.EXPENSE]);
    
    return subCategories.map((sub: DBSubCategory) => ({
      id: sub.ID.toString(),
      name: sub.SUB_CATEGORY_NAME,
      categoryId: sub.CATEGORY_ID.toString()
    }));
  } catch (error) {
    console.error("Error fetching subcategories from database:", error);
    throw new Error("Failed to fetch subcategories from database.");
  }
}

async function fetchMonthlyExpensesFromDB({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<Transaction[]> {
  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const fromTimestamp = startDate.getTime();
    const toTimestamp = endDate.getTime();

    const sql = `
      SELECT 
        t.ID,
        t.DATE,
        t.AMOUNT,
        t.NOTES,
        c.CATEGORY_NAME,
        sc.SUB_CATEGORY_NAME
      FROM Transactions t
      LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
      LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
      WHERE t.TRANSCATION_TYPE = ?
        AND t.DATE >= ?
        AND t.DATE <= ?
      ORDER BY t.DATE DESC
    `;

    const transactions = await query<{
      ID: number;
      DATE: number;
      AMOUNT: number;
      NOTES: string;
      CATEGORY_NAME: string;
      SUB_CATEGORY_NAME: string;
    }>(sql, [TransactionType.EXPENSE, fromTimestamp, toTimestamp]);

    console.log(`Fetched ${transactions.length} expense transactions`);

    return transactions
      .filter((tx: any) => tx.AMOUNT !== 0)
      .map((tx: any) => ({
        id: tx.ID.toString(),
        date: new Date(tx.DATE).toISOString().split('T')[0],
        description: tx.NOTES || 'No Description',
        amount: Number(tx.AMOUNT),
        type: 'Expense' as const,
        category: tx.CATEGORY_NAME || '',
        subCategory: tx.SUB_CATEGORY_NAME || ''
      }))
      .filter((tx: any) => tx.category || tx.subCategory); // Filter out transactions without category or subcategory
  } catch (error) {
    console.error("Error fetching expenses from database:", error);
    throw new Error("Failed to fetch expenses from database.");
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

    // Iterate and print the grouped map content
    // console.log('=== Grouped Map Content (Expenses) ===');
    // Object.entries(groupedMap).forEach(([category, subMap]) => {
    //   console.log(`Category: ${category}`);
    //   Object.entries(subMap).forEach(([subCategory, total]) => {
    //     console.log(`  SubCategory: "${subCategory}", Total: ${total}, Type: ${typeof total}`);
    //   });
    // });
    // console.log('=== End Grouped Map ===');

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
    
    if (!month || !year) {
      return NextResponse.json({ error: "Month and year are required query parameters." }, { status: 400 });
    }
    
    const [rawTransactions, categories, subCategories] = await Promise.all([
      fetchMonthlyExpensesFromDB({ month, year }),
      fetchCategoriesFromDB(),
      fetchSubCategoriesFromDB()
    ]);

    const monthlyExpenses = groupTransactions(rawTransactions, month, Number(year));

    // Sort transactions by date (already sorted DESC in query, but keeping for consistency)
    rawTransactions.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({
      monthlyExpenses,
      rawTransactions,
      categories,
      subCategories
    });
  } catch (error) {
    console.error("Error in /api/monthly-expenses:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching expense details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
export { getFromToDates, formatDateToDDMMYYYY };
export type { ExpenseItem };
