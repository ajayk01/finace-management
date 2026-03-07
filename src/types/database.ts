// Database type definitions based on the MySQL schema

export interface Account {
  ID: number;
  ACCOUNT_NAME: string;
  CURRENT_BALANCE: number;
  INITIAL_BALANCE: number;
  ACCOUNT_TYPE: number; // 1: Bank, 2: Credit Card, 3: Investment
  IS_ACTIVE: boolean | number; // MySQL returns 0/1 for boolean
  TOTAL_LIMIT: number;
  IMG: string | null; // Logo URL for the account (may be null)
}

export interface InvestmentAccountDetails {
  INVESTMENT_ACCOUNT_ID: number;
  TOTAL_INVESTED: number;
  TOTAL_WITHDRAW: number;
  CREATED_DATE: number; // timestamp in milliseconds
  CLOSED_DATE: number;
  CURRENT_VALUE: number;
  XIRR: number;
}

export interface Category {
  ID: number;
  CATEGORY_NAME: string;
  BUDGET: number;
  CATEGORY_TYPE: number; // 1: Income, 2: Expense
}

export interface SubCategory {
  ID: number;
  CATEGORY_ID: number;
  SUB_CATEGORY_NAME: string;
  BUDGET: number;
}

export interface Transaction {
  ID: number;
  DATE: number; // timestamp in milliseconds
  AMOUNT: number;
  FROM_ACCOUNT_ID: number;
  TO_ACCOUNT_ID: number;
  TRANSCATION_TYPE: number; // 1: Income, 2: Expense, 3: Transfer, 4: Investment
  CATEGORY_ID: number;
  SUB_CATEGORY_ID: number;
  NOTES: string;
}

export interface Counter {
  ID: number;
}

export interface SplitwiseFriend {
  ID: number;
  SPLITWISE_FRIEND_ID: number;
  NAME: string;
  TOTAL_OWNS: number;
}

export interface SplitwiseTransaction {
  SPLITWISE_TRANSACTION_ID: string;
  FRIEND_ID: number;
  TRANSACTION_ID: number;
  SPLITED_AMOUNT: number;
  SPLITED_TRANSACTION_ID: number | null; // References the dummy transaction in Transactions table
}

export interface CreditCardDetails {
  CREDIT_CARD_ID: number;
  TOTAL_LIMIT: number;
  CREATED_DATE: number; // timestamp in milliseconds
  CLOSED_DATE: number;
  CURRENT_REWARD_POINTS: number;
}

export interface CreditCardCapDetails {
  ID: number;
  CREDIT_CARD_ID: number;
  CAP_NAME: string;
  CAP_TOTAL_AMOUNT: number;
  CAP_PERCENTAGE: number;
  CAP_CURRENT_AMOUNT: number;
}

export interface CreditCardTransactions {
  TRANSACTION_ID: number;
  CREDIT_CARD_ID: number;
  CAP_ID: number;
  REWARDS: number;
}
