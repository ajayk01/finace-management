
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, TransactionType, AccountType } from '@/lib/db';
import type { Transaction as DBTransaction, Account } from '@/types/database';

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

interface InvestmentAccount {
  id: string;
  name: string;
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

async function fetchInvestmentAccountsFromDB(): Promise<InvestmentAccount[]> {
  try {
    const sql = `
      SELECT ID, ACCOUNT_NAME
      FROM Accounts
      WHERE ACCOUNT_TYPE = ?
        AND IS_ACTIVE = 1
      ORDER BY ACCOUNT_NAME
    `;
    
    const accounts = await query<Account>(sql, [AccountType.INVESTMENT]);
    
    return accounts.map((acc: Account) => ({
      id: acc.ID.toString(),
      name: acc.ACCOUNT_NAME
    }));
  } catch (error) {
    console.error("Error fetching investment accounts from database:", error);
    throw new Error("Failed to fetch investment accounts from database.");
  }
}

async function fetchMonthlyInvestmentsFromDB({
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
        a.ACCOUNT_NAME
      FROM Transactions t
      LEFT JOIN Accounts a ON t.TO_ACCOUNT_ID = a.ID
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
      ACCOUNT_NAME: string;
    }>(sql, [TransactionType.INVESTMENT, fromTimestamp, toTimestamp]);

    console.log(`Fetched ${transactions.length} investment transactions`);

    return transactions
      .filter((tx: any) => tx.AMOUNT !== 0)
      .map((tx: any) => ({
        id: tx.ID.toString(),
        date: new Date(tx.DATE).toISOString().split('T')[0],
        description: tx.NOTES || 'No Description',
        amount: Number(tx.AMOUNT),
        type: 'Investment' as const,
        category: tx.ACCOUNT_NAME || 'Uncategorized',
        subCategory: '' // Investments don't have sub-categories
      }));
  } catch (error) {
    console.error("Error fetching investments from database:", error);
    throw new Error("Failed to fetch investments from database.");
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
    
    // // Iterate and print the grouped map content
    // console.log('=== Grouped Map Content ===');
    // Object.entries(groupedMap).forEach(([category, subMap]) => {
    //   console.log(`Category: ${category}`);
    //   Object.entries(subMap).forEach(([subCategory, total]) => {
    //     console.log(`  SubCategory: "${subCategory}", Total: ${total}, Type: ${typeof total}`);
    //   });
    // });
    // console.log('=== End Grouped Map ===');
    
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

    if (!month || !year) {
      return NextResponse.json({ error: "Month and year are required query parameters." }, { status: 400 });
    }

    const [rawTransactions, investmentAccounts] = await Promise.all([
      fetchMonthlyInvestmentsFromDB({ month, year }),
      fetchInvestmentAccountsFromDB()
    ]);

    const monthlyInvestments = groupTransactions(rawTransactions, month, Number(year));
    console.log("monthlyInvestments :"+monthlyInvestments)
    // Sort transactions by date (already sorted DESC in query, but keeping for consistency)
    rawTransactions.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({
      monthlyInvestments,
      rawTransactions,
      investmentAccounts,
    });
  } catch (error) {
    console.error("Error in /api/monthly-investments:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching investment details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}