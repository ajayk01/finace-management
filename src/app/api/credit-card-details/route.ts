import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, AccountType } from '@/lib/db';
import { Account, CreditCardDetails } from '@/types/database';

async function fetchCreditCardsFromDB() {
  try {
    const creditCards = await query<Account & { CURRENT_REWARD_POINTS?: number }>(
      `SELECT ID, ACCOUNT_NAME, CURRENT_BALANCE, INITIAL_BALANCE, ACCOUNT_TYPE, IS_ACTIVE
       FROM Accounts
       WHERE ACCOUNT_TYPE = ? AND IS_ACTIVE = 1
       ORDER BY ACCOUNT_NAME`,
      [AccountType.CREDIT_CARD]
    );
    
    return creditCards.map((card: Account & { CURRENT_REWARD_POINTS?: number }) => ({
      id: card.ID.toString(),
      name: card.ACCOUNT_NAME,
      usedAmount: Math.abs(card.CURRENT_BALANCE), // Convert to positive for display
      totalLimit: card.TOTAL_LIMIT || 0,
      //currentRewardPoints: card.CURRENT_REWARD_POINTS || 0,
      logo: "", // Add logo logic if needed
    }));
  } catch (error) {
    console.error("Error fetching credit cards from database:", error);
    throw new Error("Failed to fetch credit cards from database.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const creditCardDetails = await fetchCreditCardsFromDB();
    return NextResponse.json({
      creditCardDetails,
    });
  } catch (error) {
    console.error("Error in /api/credit-card-details:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching credit card details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
