import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, AccountType } from '@/lib/db';
import type { Account as DBAccount, CreditCardDetails as DBCreditCardDetails, InvestmentAccountDetails as DBInvestmentAccountDetails } from '@/types/database';

interface CreateAccountRequest {
  accountName: string;
  accountType: 'Bank' | 'Credit Card' | 'Investment';
  initialBalance?: number;
  totalLimit?: number;
}

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
      SELECT ID, ACCOUNT_NAME, CURRENT_BALANCE, INITIAL_BALANCE, ACCOUNT_TYPE, IS_ACTIVE, IMG, TOTAL_LIMITS AS TOTAL_LIMIT
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
        isActive: !!account.IS_ACTIVE,
        logo: account.IMG || ""
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

export async function POST(request: NextRequest) {
  try {
    const body: CreateAccountRequest = await request.json();
    const { accountName, accountType, initialBalance = 0, totalLimit } = body;

    // Validate required fields
    if (!accountName || !accountType) {
      return NextResponse.json(
        { error: 'Account name and account type are required.' },
        { status: 400 }
      );
    }

    // Validate account type
    if (!['Bank', 'Credit Card', 'Investment'].includes(accountType)) {
      return NextResponse.json(
        { error: 'Invalid account type. Must be Bank, Credit Card, or Investment.' },
        { status: 400 }
      );
    }

    // Validate total limit for credit cards
    if (accountType === 'Credit Card' && (!totalLimit || totalLimit <= 0)) {
      return NextResponse.json(
        { error: 'Total limit is required for credit cards and must be greater than 0.' },
        { status: 400 }
      );
    }

    // Map account type to database enum
    let accountTypeId: number;
    switch (accountType) {
      case 'Bank':
        accountTypeId = AccountType.BANK;
        break;
      case 'Credit Card':
        accountTypeId = AccountType.CREDIT_CARD;
        break;
      case 'Investment':
        accountTypeId = AccountType.INVESTMENT;
        break;
      default:
        return NextResponse.json({ error: 'Invalid account type.' }, { status: 400 });
    }

    // Insert into Accounts table
    const insertAccountSql = `
      INSERT INTO Accounts (ACCOUNT_NAME, CURRENT_BALANCE, INITIAL_BALANCE, ACCOUNT_TYPE, IS_ACTIVE, TOTAL_LIMITS)
      VALUES (?, ?, ?, ?, 1, ?)
    `;

    const accountResult: any = await query(
      insertAccountSql,
      [
        accountName,
        initialBalance,
        initialBalance,
        accountTypeId,
        accountType === 'Credit Card' ? totalLimit : null
      ]
    );

    const accountId = accountResult.insertId;

    // Create type-specific details
    if (accountType === 'Credit Card') 
    {
      var currentTime = BigInt(Date.now());
      const insertCCDetailsSql = `
        INSERT INTO CreditCardDetails (CREDIT_CARD_ID, TOTAL_LIMIT, CREATED_DATE, CURRENT_REWARD_POINTS)
        VALUES (?, ?, ?, 0)
      `;
      await query(insertCCDetailsSql, [accountId, totalLimit, currentTime]);
    } 
    else if (accountType === 'Investment') 
      {
        var currentTime = BigInt(Date.now());

        const insertInvDetailsSql = `
          INSERT INTO InvestmentAccountDetails (INVESTMENT_ACCOUNT_ID, TOTAL_INVESTED, TOTAL_WITHDRAW, CREATED_DATE, CURRENT_VALUE, XIRR)
          VALUES (?, 0, 0, ?, 0, 0)
      `;
      await query(insertInvDetailsSql, [accountId, currentTime]);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully',
        accountId: accountId.toString(),
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error creating account:', error);
    const 
    errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while creating account.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
