import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, AccountType } from '@/lib/db';
import type { Account as DBAccount, CreditCardDetails as DBCreditCardDetails, InvestmentAccountDetails as DBInvestmentAccountDetails } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'bank', 'credit-card', 'investment', or 'all'

    let accountTypes: number[] = [];
    
    if (type === 'bank') {
      accountTypes = [AccountType.BANK];
    } else if (type === 'credit-card') {
      accountTypes = [AccountType.CREDIT_CARD];
    } else if (type === 'investment') {
      accountTypes = [AccountType.INVESTMENT];
    } else {
      // Return all types
      accountTypes = [AccountType.BANK, AccountType.CREDIT_CARD, AccountType.INVESTMENT];
    }

    // Fetch accounts
    const accountsSql = `
      SELECT ID, ACCOUNT_NAME, CURRENT_BALANCE, INITIAL_BALANCE, ACCOUNT_TYPE, IS_ACTIVE
      FROM Accounts`;
    
    const accounts = await query<DBAccount>(accountsSql, []);

    const bankAccounts = [];
    const creditCardAccounts = [];
    const investmentAccounts = [];

    for (const account of accounts) {
      const baseAccount = {
        id: account.ID.toString(),
        name: account.ACCOUNT_NAME,
        currentBalance: account.CURRENT_BALANCE,
        initialBalance: account.INITIAL_BALANCE,
        isActive: !!account.IS_ACTIVE
      };

      if (account.ACCOUNT_TYPE === AccountType.BANK) {
        bankAccounts.push({
          ...baseAccount,
          type: 'Bank' as const
        });
      } else if (account.ACCOUNT_TYPE === AccountType.CREDIT_CARD) {
        // Fetch credit card details
        const ccDetailsSql = `
          SELECT CREDIT_CARD_ID, TOTAL_LIMIT, CREATED_DATE, CLOSED_DATE, CURRENT_REWARD_POINTS
          FROM CreditCardDetails
          WHERE CREDIT_CARD_ID = ?
        `;
        const ccDetails = await query<DBCreditCardDetails>(ccDetailsSql, [account.ID]);
        
        creditCardAccounts.push({
          ...baseAccount,
          type: 'Credit Card' as const,
          totalLimit: account.TOTAL_LIMIT,
          usedAmount: account.CURRENT_BALANCE,
          availableCredit: account.TOTAL_LIMIT - account.CURRENT_BALANCE,
          rewardPoints: ccDetails[0]?.CURRENT_REWARD_POINTS || 0
        });
      } else if (account.ACCOUNT_TYPE === AccountType.INVESTMENT) {
        // Fetch investment account details
        const invDetailsSql = `
          SELECT INVESTMENT_ACCOUNT_ID, TOTAL_INVESTED, TOTAL_WITHDRAW, CREATED_DATE, CLOSED_DATE, CURRENT_VALUE, XIRR
          FROM InvestmentAccountDetails
          WHERE INVESTMENT_ACCOUNT_ID = ?
        `;
        const invDetails = await query<DBInvestmentAccountDetails>(invDetailsSql, [account.ID]);
        
        investmentAccounts.push({
          ...baseAccount,
          type: 'Investment' as const,
          totalInvested: invDetails[0]?.TOTAL_INVESTED || 0,
          totalWithdraw: invDetails[0]?.TOTAL_WITHDRAW || 0,
          currentValue: invDetails[0]?.CURRENT_VALUE || 0,
          xirr: invDetails[0]?.XIRR || 0
        });
      }
    }

    const response: any = {};

    if (!type || type === 'all') {
      response.bankAccounts = bankAccounts;
      response.creditCardAccounts = creditCardAccounts;
      response.investmentAccounts = investmentAccounts;
    } else if (type === 'bank') {
      response.accounts = bankAccounts;
    } else if (type === 'credit-card') {
      response.accounts = creditCardAccounts;
    } else if (type === 'investment') {
      response.accounts = investmentAccounts;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching accounts:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while fetching accounts.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
