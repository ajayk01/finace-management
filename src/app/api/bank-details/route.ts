import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, AccountType } from '@/lib/db';
import { Account } from '@/types/database';

async function fetchBankAccountsFromDB() {
  try {
    const accounts = await query<Account>(
      `SELECT ID, ACCOUNT_NAME, CURRENT_BALANCE, INITIAL_BALANCE, ACCOUNT_TYPE, IS_ACTIVE, IMG
       FROM Accounts
       WHERE ACCOUNT_TYPE = ? AND IS_ACTIVE = 1
       ORDER BY ACCOUNT_NAME`,
      [AccountType.BANK]
    );
    
    return accounts.map((account: Account) => ({
      id: account.ID.toString(),
      name: account.ACCOUNT_NAME,
      balance: account.CURRENT_BALANCE,
      initialBalance: account.INITIAL_BALANCE,
      logo: account.IMG || "",
    }));
  } catch (error) {
    console.error("Error fetching bank accounts from database:", error);
    throw new Error("Failed to fetch bank accounts from database.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const bankAccounts = await fetchBankAccountsFromDB();
    return NextResponse.json({
      bankAccounts,
    });
  } catch (error) {
    console.error("Error in /api/bank-details:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching bank details.";
    const errorDetails = error instanceof Error ? error.stack : String(error);
    return NextResponse.json({ 
      error: errorMessage,
      details: errorDetails,
      message: "Check server console for full error"
    }, { status: 500 });
  }
}
