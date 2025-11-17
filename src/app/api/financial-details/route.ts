
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, TransactionType, CategoryType } from '@/lib/db';
import type { Transaction, Category, SubCategory, Account } from '@/types/database';
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

async function fetchGroupedMonthlyExpensesFromDB({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<ExpenseItem[]> {
  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const fromTimestamp = startDate.getTime();
    const toTimestamp = endDate.getTime();

    // Query to fetch expense transactions with category and subcategory names
    const sql = `
      SELECT 
        t.AMOUNT,
        c.CATEGORY_NAME,
        sc.SUB_CATEGORY_NAME
      FROM Transactions t
      LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
      LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
      WHERE t.TRANSCATION_TYPE = ?
        AND t.DATE >= ?
        AND t.DATE <= ?
    `;

    const transactions = await query<{
      AMOUNT: number;
      CATEGORY_NAME: string;
      SUB_CATEGORY_NAME: string;
    }>(sql, [TransactionType.EXPENSE, fromTimestamp, toTimestamp]);

    // Group and sum by category and subcategory
    const groupedMap: Record<string, Record<string, number>> = {};

    transactions.forEach(({ CATEGORY_NAME, SUB_CATEGORY_NAME, AMOUNT }: { CATEGORY_NAME: string; SUB_CATEGORY_NAME: string; AMOUNT: number }) => {
      const category = CATEGORY_NAME || '';
      const subCategory = SUB_CATEGORY_NAME || '';
      
      // Skip if both are empty
      if (!category && !subCategory) return;

      if (!groupedMap[category]) groupedMap[category] = {};
      if (!groupedMap[category][subCategory]) groupedMap[category][subCategory] = 0;
      groupedMap[category][subCategory] += AMOUNT;
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
    console.error("Error fetching and grouping expenses from database:", error);
    throw new Error("Failed to fetch grouped monthly expenses from database.");
  }
}

async function fetchMonthlyIncomesFromDB({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<ExpenseItem[]> {
  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const fromTimestamp = startDate.getTime();
    const toTimestamp = endDate.getTime();

    // Query to fetch income transactions with category and subcategory names
    const sql = `
      SELECT 
        t.AMOUNT,
        c.CATEGORY_NAME,
        sc.SUB_CATEGORY_NAME
      FROM Transactions t
      LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
      LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
      WHERE t.TRANSCATION_TYPE = ?
        AND t.DATE >= ?
        AND t.DATE <= ?
    `;

    const transactions = await query<{
      AMOUNT: number;
      CATEGORY_NAME: string;
      SUB_CATEGORY_NAME: string;
    }>(sql, [TransactionType.INCOME, fromTimestamp, toTimestamp]);

    // Group and sum by category and subcategory
    const groupedMap: Record<string, Record<string, number>> = {};

    transactions.forEach(({ CATEGORY_NAME, SUB_CATEGORY_NAME, AMOUNT }: { CATEGORY_NAME: string; SUB_CATEGORY_NAME: string; AMOUNT: number }) => {
      const category = CATEGORY_NAME || '';
      const subCategory = SUB_CATEGORY_NAME || '';
      
      // Skip if both are empty or amount is 0
      if ((!category && !subCategory) || AMOUNT === 0) return;

      if (!groupedMap[category]) groupedMap[category] = {};
      if (!groupedMap[category][subCategory]) groupedMap[category][subCategory] = 0;
      groupedMap[category][subCategory] += AMOUNT;
    });

    // Convert to ExpenseItem[]
    const incomeArray: ExpenseItem[] = Object.entries(groupedMap).flatMap(
      ([category, subMap]) =>
        Object.entries(subMap).map(([subCategory, total]) => ({
          year: Number(year),
          month: String(month),
          category,
          subCategory,
          expense: `₹${total}`
        }))
    );

    return incomeArray;
  } catch (error) {
    console.error("Error fetching monthly income from database:", error);
    throw new Error("Failed to fetch monthly income from database.");
  }
}

async function fetchMonthlyInvFromDB({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<ExpenseItem[]> {
  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const fromTimestamp = startDate.getTime();
    const toTimestamp = endDate.getTime();

    // Query to fetch investment transactions with account names
    const sql = `
      SELECT 
        t.AMOUNT,
        a.ACCOUNT_NAME
      FROM Transactions t
      LEFT JOIN Accounts a ON t.TO_ACCOUNT_ID = a.ID
      WHERE t.TRANSCATION_TYPE = ?
        AND t.DATE >= ?
        AND t.DATE <= ?
    `;

    const transactions = await query<{
      AMOUNT: number;
      ACCOUNT_NAME: string;
    }>(sql, [TransactionType.INVESTMENT, fromTimestamp, toTimestamp]);

    // Group and sum by account name
    const groupedMap: Record<string, number> = {};

    transactions.forEach(({ ACCOUNT_NAME, AMOUNT }: { ACCOUNT_NAME: string; AMOUNT: number }) => {
      const accountName = ACCOUNT_NAME || '';
      
      // Skip if amount is 0 or account name is empty
      if (!accountName || AMOUNT === 0) return;

      if (!groupedMap[accountName]) groupedMap[accountName] = 0;
      groupedMap[accountName] += AMOUNT;
    });

    // Convert to ExpenseItem[]
    const investmentArray: ExpenseItem[] = Object.entries(groupedMap).map(
      ([accountName, total]) => ({
        year: Number(year),
        month: String(month),
        category: accountName,
        subCategory: '',
        expense: `₹${total}`
      })
    );

    return investmentArray;
  } catch (error) {
    console.error("Error fetching monthly investments from database:", error);
    throw new Error("Failed to fetch monthly investments from database.");
  }
}



export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    // Validate month and year parameters
    if (!month || !year) {
      return NextResponse.json(
        { error: "Month and year parameters are required." },
        { status: 400 }
      );
    }

    const [
      monthlyExpenses,
      monthlyIncome,
      monthlyInvestments
    ] = await Promise.all([
      fetchGroupedMonthlyExpensesFromDB({ month, year }),
      fetchMonthlyIncomesFromDB({ month, year }),
      fetchMonthlyInvFromDB({ month, year }),
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