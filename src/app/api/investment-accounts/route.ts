import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { Account } from '@/types/database';

export async function GET() {
  try {
    const sql = `
      SELECT ID, ACCOUNT_NAME
      FROM Accounts
      WHERE ACCOUNT_TYPE = 3
      ORDER BY ACCOUNT_NAME
    `;
    
    const accounts = await query<Account>(sql);
    
    const investmentAccounts = accounts.map((acc: Account) => ({
      id: acc.ID.toString(),
      name: acc.ACCOUNT_NAME
    }));

    return NextResponse.json(investmentAccounts);
  } catch (error) {
    console.error('Error fetching investment accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch investment accounts.' },
      { status: 500 }
    );
  }
}
