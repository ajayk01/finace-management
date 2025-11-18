
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

async function fetchSplitwiseAdjustmentsFromDB({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<{ category: string; subCategory: string; amount: number }[]> {
  try {
    const { startDate, endDate } = getFromToDates(String(month), Number(year));
    const fromTimestamp = startDate.getTime();
    const toTimestamp = endDate.getTime();
    console.log("Fetching splitwise adjustments from "+fromTimestamp+ 
    " to "+toTimestamp);
    const sql = `
      SELECT 
        st.SPLITED_AMOUNT,
        c.CATEGORY_NAME,
        sc.SUB_CATEGORY_NAME
      FROM SplitwiseTransactions st
      INNER JOIN Transactions t ON st.TRANSACTION_ID = t.ID
      LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
      LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
      WHERE st.TRANSACTION_ID IS NOT NULL
        AND t.DATE >= ?
        AND t.DATE <= ?
    `;

    const adjustments = await query<{
      SPLITED_AMOUNT: number;
      CATEGORY_NAME: string;
      SUB_CATEGORY_NAME: string;
    }>(sql, [fromTimestamp, toTimestamp]);

    console.log(`Fetched ${adjustments.length} splitwise adjustments`);

    return adjustments.map((adj: any) => ({
      category: adj.CATEGORY_NAME || '',
      subCategory: adj.SUB_CATEGORY_NAME || '',
      amount: Number(adj.SPLITED_AMOUNT)
    }));
  } catch (error) {
    console.error("Error fetching splitwise adjustments from database:", error);
    throw new Error("Failed to fetch splitwise adjustments from database.");
  }
}

async function fetchUnsettledSplitwiseTransactionsFromDB({
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
        st.SPLITWISE_TRANSACTION_ID as ID,
        t.DATE,
        st.SPLITED_AMOUNT as AMOUNT,
        t.NOTES,
        c.CATEGORY_NAME,
        sc.SUB_CATEGORY_NAME,
        sf.NAME as FRIEND_NAME
      FROM SplitwiseTransactions st
      INNER JOIN Transactions t ON st.TRANSACTION_ID = t.ID
      INNER JOIN SplitwiseFriends sf ON st.FRIEND_ID = sf.ID
      LEFT JOIN Category c ON t.CATEGORY_ID = c.ID
      LEFT JOIN SubCategory sc ON t.SUB_CATEGORY_ID = sc.ID
      WHERE st.TRANSACTION_ID IS NOT NULL
        AND t.DATE >= ?
        AND t.DATE <= ?
      ORDER BY t.DATE DESC
    `;

    const transactions = await query<{
      ID: string;
      DATE: number;
      AMOUNT: number;
      NOTES: string;
      CATEGORY_NAME: string;
      SUB_CATEGORY_NAME: string;
      FRIEND_NAME: string;
    }>(sql, [fromTimestamp, toTimestamp]);

    console.log(`Fetched ${transactions.length} unsettled splitwise transactions`);

    return transactions.map((tx: any, index: number) => ({
      id: `splitwise-${tx.ID}-${index}`,
      date: new Date(tx.DATE).toISOString().split('T')[0],
      description: `${tx.NOTES || 'Splitwise expense'} (Split with ${tx.FRIEND_NAME} - Not Settled)`,
      amount: Number(tx.AMOUNT),
      type: 'Expense' as const,
      category: tx.CATEGORY_NAME || '',
      subCategory: tx.SUB_CATEGORY_NAME || ''
    }));
  } catch (error) {
    console.error("Error fetching unsettled splitwise transactions from database:", error);
    throw new Error("Failed to fetch unsettled splitwise transactions from database.");
  }
}

async function fetchPendingSplitwiseExpensesFromDB({
  month,
  year
}: {
  month?: string;
  year?: string;
}): Promise<{ category: string; subCategory: string; amount: number }[]> {
  try {
    const sql = `
      SELECT 
        st.SPLITED_AMOUNT,
        sf.NAME as FRIEND_NAME
      FROM SplitwiseTransactions st
      INNER JOIN SplitwiseFriends sf ON st.FRIEND_ID = sf.ID
      WHERE st.TRANSACTION_ID IS NULL
    `;

    const pendingExpenses = await query<{
      SPLITED_AMOUNT: number;
      FRIEND_NAME: string;
    }>(sql, []);

    console.log(`Fetched ${pendingExpenses.length} pending splitwise expenses (TRANSACTION_ID is NULL)`);

    // Group by friend and return as "From Splitwise" category
    return pendingExpenses.map((exp: any) => ({
      category: 'From Splitwise',
      subCategory: exp.FRIEND_NAME,
      amount: Number(exp.SPLITED_AMOUNT)
    }));
  } catch (error) {
    console.error("Error fetching pending splitwise expenses from database:", error);
    throw new Error("Failed to fetch pending splitwise expenses from database.");
  }
}

function groupTransactions(
  transactions: Transaction[], 
  splitwiseAdjustments: { category: string; subCategory: string; amount: number }[],
  pendingSplitwiseExpenses: { category: string; subCategory: string; amount: number }[],
  month: string, 
  year: number
): ExpenseItem[] {
    const groupedMap: Record<string, Record<string, number>> = {};

    // Add regular transactions
    transactions.forEach(({ category, subCategory, amount }) => {
      const cat = category || 'Uncategorized';
      const sub = subCategory || 'Uncategorized';
      if (!groupedMap[cat]) groupedMap[cat] = {};
      if (!groupedMap[cat][sub]) groupedMap[cat][sub] = 0;
      groupedMap[cat][sub] += amount;
    });
    console.log('Grouped Map after adding transactions:', JSON.stringify(groupedMap, null, 2));
    
    // Subtract splitwise adjustments (settled transactions)
    splitwiseAdjustments.forEach(({ category, subCategory, amount }) => {
      const cat = category || 'Uncategorized';
      const sub = subCategory || 'Uncategorized';
      if (!groupedMap[cat]) groupedMap[cat] = {};
      if (!groupedMap[cat][sub]) groupedMap[cat][sub] = 0;
      groupedMap[cat][sub] -= amount;
    });
    
    // Add pending splitwise expenses (TRANSACTION_ID is NULL)
    pendingSplitwiseExpenses.forEach(({ category, subCategory, amount }) => {
      const cat = category || 'From Splitwise';
      const sub = subCategory || 'Pending';
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
        Object.entries(subMap)
          .filter(([_, total]) => total !== 0) // Filter out zero amounts
          .map(([subCategory, total]) => ({
            year: Number(year),
            month: String(month),
            category,
            subCategory,
            expense: `₹${total.toFixed(2)}`
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
    
    const [rawTransactions, unsettledSplitwiseTransactions, splitwiseAdjustments, pendingSplitwiseExpenses, categories, subCategories] = await Promise.all([
      fetchMonthlyExpensesFromDB({ month, year }),
      fetchUnsettledSplitwiseTransactionsFromDB({ month, year }),
      fetchSplitwiseAdjustmentsFromDB({ month, year }),
      fetchPendingSplitwiseExpensesFromDB({ month, year }),
      fetchCategoriesFromDB(),
      fetchSubCategoriesFromDB()
    ]);

    // Combine regular transactions with unsettled splitwise transactions
    const allRawTransactions = [...rawTransactions, ...unsettledSplitwiseTransactions];

    const monthlyExpenses = groupTransactions(rawTransactions, splitwiseAdjustments, pendingSplitwiseExpenses, month, Number(year));

    // Sort all transactions by date (already sorted DESC in query, but keeping for consistency)
    allRawTransactions.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({
      monthlyExpenses,
      rawTransactions: allRawTransactions,
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
