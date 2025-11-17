
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, TransactionType, AccountType } from '@/lib/db';
import type { Account } from '@/types/database';

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

interface InvestmentAccount {
  id: string;
  name: string;
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

async function fetchTotalInvestmentsFromDB(): Promise<Transaction[]> {
  try {
    const sql = `
      SELECT 
        a.ID as ACCOUNT_ID,
        a.ACCOUNT_NAME,
        SUM(t.AMOUNT) as TOTAL_INVESTED
      FROM Accounts a
      LEFT JOIN Transactions t ON t.TO_ACCOUNT_ID = a.ID 
        AND t.TRANSCATION_TYPE = ?
      WHERE a.ACCOUNT_TYPE = ?
        AND a.IS_ACTIVE = 1
      GROUP BY a.ID, a.ACCOUNT_NAME
      HAVING SUM(t.AMOUNT) > 0
      ORDER BY a.ACCOUNT_NAME
    `;

    const results = await query<{
      ACCOUNT_ID: number;
      ACCOUNT_NAME: string;
      TOTAL_INVESTED: number;
    }>(sql, [TransactionType.INVESTMENT, AccountType.INVESTMENT]);

    console.log(`Fetched ${results.length} total investment accounts`);

    return results.map((row: any) => ({
      id: row.ACCOUNT_ID.toString(),
      amount: Number(row.TOTAL_INVESTED) || 0,
      type: 'Investment' as const,
      category: row.ACCOUNT_NAME,
      description: `Total invested in ${row.ACCOUNT_NAME}`,
      subCategory: '',
      date: null, // Total investments don't have a specific date
    }));
  } catch (error) {
    console.error("Error fetching total investments from database:", error);
    throw new Error("Failed to fetch total investments from database.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const [rawTransactions, investmentAccounts] = await Promise.all([
      fetchTotalInvestmentsFromDB(),
      fetchInvestmentAccountsFromDB()
    ]);

    // Sort by amount descending (highest investments first)
    rawTransactions.sort((a: Transaction, b: Transaction) => b.amount - a.amount);

    return NextResponse.json({
      rawTransactions,
      investmentAccounts,
    });
  } catch (error) {
    console.error("Error in /api/total-investments:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching investment details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
