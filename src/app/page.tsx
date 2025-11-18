
"use client"
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ExpenseBreakdownTable } from "@/components/dashboard/expense-breakdown-table";
import { MonthlySummaryChart } from "@/components/dashboard/monthly-summary-chart";
import { MonthlyMoneyTable, type FinancialSnapshotItem } from "@/components/dashboard/monthly-money-table";
import { TransactionDialog } from "@/components/dashboard/transaction-dialog"; // Import new component
import { InvestmentCalculatorDialog } from "@/components/dashboard/investment-calculator-dialog";
import { AlertCircle } from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Category, SubCategory, Account } from "@/components/dashboard/add-expense-dialog";
import type { InvestmentCategory } from "@/components/dashboard/add-investment-dialog";
import { SplitwiseDialog } from "@/components/dashboard/splitwise-dialog";
import type { FriendBalance } from "@/components/dashboard/splitwise-dialog";


const monthOptions = [
  { value: "jan", label: "January" },
  { value: "feb", label: "February" },
  { value: "mar", label: "March" },
  { value: "apr", label: "April" },
  { value: "may", label: "May" },
  { value: "jun", label: "June" },
  { value: "jul", label: "July" },
  { value: "aug", label: "August" },
  { value: "sep", label: "September" },
  { value: "oct", label: "October" },
  { value: "nov", label: "November" },
  { value: "dec", label: "December" },
];

interface ExpenseItem { // Reused for income and investments as structure is similar
  year: number;
  month: string;
  category: string;
  subCategory: string;
  expense: string; // "expense" key used for amount string (e.g., "₹100.00")
}

interface BankAccount {
  id: string;
  name: string;
  balance: number;
  logo: string;
}

interface CreditCardAccount {
  id: string;
  name: string;
  usedAmount: number;
  totalLimit: number;
  logo: string;
}

export interface Transaction {
  id: string;
  date: string | null;
  description: string;
  amount: number;
  type: 'Income' | 'Expense' | 'Investment' | 'Transfer' | 'Other';
  category?: string;
  subCategory?: string;
}

interface SummaryDataItem {
    month: string;
    expense: number;
    income: number;
    investment: number;
}

const parseCurrency = (currencyStr: string): number => {
  if (!currencyStr) return 0;
  return parseFloat(currencyStr.replace('₹', '').replace(/,/g, ''));
};

const getAvailableYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear; y >= 2022; y--) {
        years.push({ value: y, label: y.toString() });
    }
    return years;
};

const groupTransactions = (transactions: Transaction[], month: string, year: number): ExpenseItem[] => {
    const groupedMap: Record<string, Record<string, number>> = {};

    transactions.forEach(({ category, subCategory, amount }) => {
      const cat = category || 'Uncategorized';
      const sub = subCategory || 'Uncategorized';
      if (!groupedMap[cat]) groupedMap[cat] = {};
      if (!groupedMap[cat][sub]) groupedMap[cat][sub] = 0;
      groupedMap[cat][sub] += amount;
    });

    const groupedArray: ExpenseItem[] = Object.entries(groupedMap).flatMap(
      ([category, subMap]) =>
        Object.entries(subMap).map(([subCategory, total]) => ({
          year: Number(year),
          month: String(month),
          category,
          subCategory,
          expense: `₹${total.toFixed(2)}`
        }))
    );

    return groupedArray;
};


export default function DashboardPage() {
  const dataCache = useRef<Record<string, any>>({});
  const now = new Date();
  const currentMonthValue = monthOptions[now.getMonth()].value;
  const currentYear = now.getFullYear();

  // --- State Declarations ---
  // Bank Details State
  const [apiBankAccounts, setApiBankAccounts] = useState<BankAccount[]>([]);
  const [isBankDetailsLoading, setIsBankDetailsLoading] = useState<boolean>(true);
  const [bankDetailsError, setBankDetailsError] = useState<string | null>(null);

  // Credit Card Details State
  const [apiCreditCards, setApiCreditCards] = useState<CreditCardAccount[]>([]);
  const [isCreditCardDetailsLoading, setIsCreditCardDetailsLoading] = useState<boolean>(true);
  const [creditCardDetailsError, setCreditCardDetailsError] = useState<string | null>(null);
  
  // Expenses State
  const [rawMonthlyExpenses, setRawMonthlyExpenses] = useState<Transaction[]>([]);
  const [isExpensesLoading, setIsExpensesLoading] = useState<boolean>(true);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [selectedExpenseMonth, setSelectedExpenseMonth] = useState<string>(currentMonthValue);
  const [selectedExpenseYear, setSelectedExpenseYear] = useState<number>(currentYear);
  const [excludedExpenseIds, setExcludedExpenseIds] = useState<Set<string>>(new Set());
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [expenseSubCategories, setExpenseSubCategories] = useState<SubCategory[]>([]);

  // Income State
  const [rawMonthlyIncome, setRawMonthlyIncome] = useState<Transaction[]>([]);
  const [isIncomeLoading, setIsIncomeLoading] = useState<boolean>(true);
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const [selectedIncomeMonth, setSelectedIncomeMonth] = useState<string>(currentMonthValue);
  const [selectedIncomeYear, setSelectedIncomeYear] = useState<number>(currentYear);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [incomeSubCategories, setIncomeSubCategories] = useState<SubCategory[]>([]);


  // Investments State
  const [rawMonthlyInvestments, setRawMonthlyInvestments] = useState<Transaction[]>([]);
  const [isInvestmentsLoading, setIsInvestmentsLoading] = useState<boolean>(true);
  const [investmentsError, setInvestmentsError] = useState<string | null>(null);
  const [selectedInvestmentMonth, setSelectedInvestmentMonth] = useState<string>(currentMonthValue);
  const [selectedInvestmentYear, setSelectedInvestmentYear] = useState<number>(currentYear);
  const [investmentCategories, setInvestmentCategories] = useState<InvestmentCategory[]>([]);

  // Total Investments state
  const [isTotalInvestmentsLoading, setIsTotalInvestmentsLoading] = useState<boolean>(true);
  const [totalInvestmentsError, setTotalInvestmentsError] = useState<string | null>(null);
  const [totalInvestments, setTotalInvestments] = useState<Transaction[]>([]);
  const [xirrData, setXirrData] = useState<Record<string, number>>({});
  const [isXirrLoading, setIsXirrLoading] = useState<boolean>(false);
  const [hasXirrBeenCalculated, setHasXirrBeenCalculated] = useState<boolean>(false);


  // Summary Chart & Netflow State
  const [apiSummaryData, setApiSummaryData] = useState<SummaryDataItem[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedSummaryYear, setSelectedSummaryYear] = useState<number>(currentYear);
  const [selectedSummaryDetailMonth, setSelectedSummaryDetailMonth] = useState<string>(currentMonthValue);

  // State for transaction dialog
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState<boolean>(false);
  const [transactionDialogTitle, setTransactionDialogTitle] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState<boolean>(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [transactionPage, setTransactionPage] = useState<number>(1);
  const [allFetchedTransactions, setAllFetchedTransactions] = useState<Transaction[]>([]);
  const [isFetchingMoreTransactions, setIsFetchingMoreTransactions] = useState(false);
  const [transactionEntityType, setTransactionEntityType] = useState<'bank' | 'credit-card' | null>(null);
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState<string>('all');
  
  // State for investment calculator dialog
  const [isInvestmentCalculatorOpen, setIsInvestmentCalculatorOpen] = useState(false);
  
  // State for Splitwise dialog
  const [isSplitwiseDialogOpen, setIsSplitwiseDialogOpen] = useState(false);
  const [isFriendsBalanceLoading, setIsFriendsBalanceLoading] = useState(false);
  const [friendsBalanceError, setFriendsBalanceError] = useState<string | null>(null);
  const [friendsBalance, setFriendsBalance] = useState<FriendBalance[]>([]);
  const availableYears = useMemo(() => getAvailableYears(), []);
  
  // --- Data Fetching Functions ---
  const fetchBankDetails = useCallback(async () => {
      setIsBankDetailsLoading(true); setBankDetailsError(null);
      try {
        const res = await fetch('/api/bank-details');
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
        const data = await res.json();
        setApiBankAccounts(data.bankAccounts || []);
      } catch (error) {
        setBankDetailsError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setIsBankDetailsLoading(false);
      }
  }, []);

  const fetchCreditCardDetails = useCallback(async () => {
      setIsCreditCardDetailsLoading(true); setCreditCardDetailsError(null);
      try {
          const res = await fetch('/api/credit-card-details');
          if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
          const data = await res.json();
          setApiCreditCards(data.creditCardDetails || []);
      } catch (error) {
          setCreditCardDetailsError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
          setIsCreditCardDetailsLoading(false);
      }
  }, []);

  const fetchInvestmentAccounts = useCallback(async () => {
      try {
          const res = await fetch('/api/investment-accounts');
          if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
          const data = await res.json();
          setInvestmentCategories(data || []);
      } catch (error) {
          console.error('Error fetching investment accounts:', error);
      }
  }, []);

  const calculateXIRRForCategory = useCallback(async (categoryId: string): Promise<number | undefined> => {
    try {
      const res = await fetch('/api/calculate-xirr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ investmentAccountId: categoryId }),
      });
      
      if (!res.ok) {
        console.warn(`Failed to calculate XIRR for category ${categoryId}`);
        return undefined;
      }
      
      const data = await res.json();
      return data.xirr ? (data.xirr * 100) : undefined; // Convert to percentage
    } catch (error) {
      console.warn(`Error calculating XIRR for category ${categoryId}:`, error);
      return undefined;
    }
  }, []);

  const getXIRRForTransaction = useCallback((transaction: Transaction): number | undefined => {
    // Find the investment category that matches this transaction's category
    const matchingCategory = investmentCategories.find(cat => cat.name === transaction.category);
    if (!matchingCategory) return undefined;
    
    return xirrData[matchingCategory.id];
  }, [investmentCategories, xirrData]);

  const handleCalculateXIRR = useCallback(async () => {
    // Open the investment calculator dialog instead of directly calculating
    setIsInvestmentCalculatorOpen(true);
  }, []);

  const handleXirrCalculated = useCallback((accountId: string, xirr: number) => {
    setXirrData(prev => ({
      ...prev,
      [accountId]: xirr
    }));
    setHasXirrBeenCalculated(true);
  }, []);
  
  const fetchExpenses = useCallback(async (month: string, year: number) => {
    const cacheKey = `expenses-${year}-${month}`;
    if (dataCache.current[cacheKey]) {
        setRawMonthlyExpenses(dataCache.current[cacheKey].rawTransactions);
        setExpenseCategories(dataCache.current[cacheKey].categories);
        setExpenseSubCategories(dataCache.current[cacheKey].subCategories);
        setIsExpensesLoading(false);
        return;
    }
    setIsExpensesLoading(true); setExpensesError(null);
    try {
      const res = await fetch(`/api/monthly-expenses?month=${month}&year=${year}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
      const data = await res.json();
      const rawTransactions = data.rawTransactions || [];
      const categories = data.categories || [];
      const subCategories = data.subCategories || [];
      setExpenseCategories(categories);
      setExpenseSubCategories(subCategories);
      setRawMonthlyExpenses(rawTransactions);
      setExcludedExpenseIds(new Set()); // Reset on month change
      dataCache.current[cacheKey] = { rawTransactions, categories, subCategories };
    } catch (error) {
      setExpensesError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsExpensesLoading(false);
    }
  }, []);
  
  const fetchIncome = useCallback(async (month: string, year: number) => {
      const cacheKey = `income-${year}-${month}`;
      if (dataCache.current[cacheKey]) {
          setRawMonthlyIncome(dataCache.current[cacheKey].rawTransactions);
          setIncomeCategories(dataCache.current[cacheKey].categories);
          setIncomeSubCategories(dataCache.current[cacheKey].subCategories);
          setIsIncomeLoading(false);
          return;
      }
      setIsIncomeLoading(true); setIncomeError(null);
      try {
          const res = await fetch(`/api/monthly-income?month=${month}&year=${year}`);
          if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
          const data = await res.json();
          const rawTransactions = data.rawTransactions || [];
          const categories = data.categories || [];
          const subCategories = data.subCategories || [];
          setRawMonthlyIncome(rawTransactions);
          setIncomeCategories(categories);
          setIncomeSubCategories(subCategories);
          dataCache.current[cacheKey] = { rawTransactions, categories, subCategories };
      } catch (error) {
          setIncomeError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
          setIsIncomeLoading(false);
      }
  }, []);

  const handleExpenseAdded = useCallback((newExpense: Transaction, accountId: string, accountType: 'Bank' | 'Credit Card') => {
    // Update raw expenses if the new expense is in the currently viewed month/year
    const expenseDate = new Date(newExpense.date!);
    if (expenseDate.getFullYear() === selectedExpenseYear && monthOptions[expenseDate.getMonth()].value === selectedExpenseMonth) {
      setRawMonthlyExpenses(prev => [...prev, newExpense].sort((a,b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()));
    }
    
    // Update account balances
    if(accountType === 'Bank') {
        setApiBankAccounts(prev => prev.map(acc => 
            acc.id === accountId ? { ...acc, balance: acc.balance - newExpense.amount } : acc
        ));
    } else if (accountType === 'Credit Card') {
        setApiCreditCards(prev => prev.map(card => 
            card.id === accountId ? { ...card, usedAmount: card.usedAmount + newExpense.amount } : card
        ));
    }
  }, [selectedExpenseMonth, selectedExpenseYear]);
  
  const handleIncomeAdded = useCallback((newIncome: Transaction, accountId: string, accountType: 'Bank' | 'Credit Card') => {
    const incomeDate = new Date(newIncome.date!);
    if (incomeDate.getFullYear() === selectedIncomeYear && monthOptions[incomeDate.getMonth()].value === selectedIncomeMonth) {
      setRawMonthlyIncome(prev => [...prev, newIncome].sort((a,b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()));
    }
    
    if(accountType === 'Bank') {
        setApiBankAccounts(prev => prev.map(acc => 
            acc.id === accountId ? { ...acc, balance: acc.balance + newIncome.amount } : acc
        ));
    } else if (accountType === 'Credit Card') {
      // Typically income doesn't go to a credit card, but if it's a refund-like transaction:
      setApiCreditCards(prev => prev.map(card => 
          card.id === accountId ? { ...card, usedAmount: card.usedAmount - newIncome.amount } : card
      ));
    }
  }, [selectedIncomeMonth, selectedIncomeYear]);

  const handleInvestmentAdded = useCallback((newInvestment: Transaction, fromAccountId: string) => {
    const investmentDate = new Date(newInvestment.date!);
    if (investmentDate.getFullYear() === selectedInvestmentYear && monthOptions[investmentDate.getMonth()].value === selectedInvestmentMonth) {
        setRawMonthlyInvestments(prev => [...prev, newInvestment].sort((a,b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()));
    }

    setApiBankAccounts(prev => prev.map(acc =>
        acc.id === fromAccountId ? { ...acc, balance: acc.balance - newInvestment.amount } : acc
    ));
  }, [selectedInvestmentMonth, selectedInvestmentYear]);

  const handleToggleExcludeTransaction = (transactionId: string) => {
    setExcludedExpenseIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(transactionId)) {
            newSet.delete(transactionId);
        } else {
            newSet.add(transactionId);
        }
        return newSet;
    });
  };

  const handleClearExclusions = () => {
    setExcludedExpenseIds(new Set());
  };

  const handlePaymentMade = useCallback((payment: Transaction, fromBankId: string, toCreditCardId: string, amount: number) => {
    // Update bank account balance (decrease)
    setApiBankAccounts(prev => prev.map(acc => 
      acc.id === fromBankId ? { ...acc, balance: acc.balance - amount } : acc
    ));
    
    // Update credit card used amount (decrease)
    setApiCreditCards(prev => prev.map(card => 
      card.id === toCreditCardId ? { ...card, usedAmount: card.usedAmount - amount } : card
    ));

    // Add the payment as an expense in the current month if it matches
    const paymentDate = new Date(payment.date!);
    if (paymentDate.getFullYear() === selectedExpenseYear && monthOptions[paymentDate.getMonth()].value === selectedExpenseMonth) {
      setRawMonthlyExpenses(prev => [...prev, payment].sort((a,b) => new Date(b.date!).getTime() - new Date(a.date!).getTime()));
    }
  }, [selectedExpenseMonth, selectedExpenseYear]);

  // --- Data Fetching Effects ---
  useEffect(() => {
    fetchBankDetails();
    fetchCreditCardDetails();
    fetchInvestmentAccounts();
  }, [fetchBankDetails, fetchCreditCardDetails, fetchInvestmentAccounts]);
  
  useEffect(() => {
    fetchExpenses(selectedExpenseMonth, selectedExpenseYear);
  }, [selectedExpenseMonth, selectedExpenseYear, fetchExpenses]);

  useEffect(() => {
    fetchIncome(selectedIncomeMonth, selectedIncomeYear);
  }, [selectedIncomeMonth, selectedIncomeYear, fetchIncome]);

  useEffect(() => {
    async function fetchInvestments() {
      const cacheKey = `investments-${selectedInvestmentYear}-${selectedInvestmentMonth}`;
      if (dataCache.current[cacheKey]) {
        setRawMonthlyInvestments(dataCache.current[cacheKey].rawTransactions);
        setIsInvestmentsLoading(false);
        return;
      }
      setIsInvestmentsLoading(true); setInvestmentsError(null);
      try {
        const res = await fetch(`/api/monthly-investments?month=${selectedInvestmentMonth}&year=${selectedInvestmentYear}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
        const data = await res.json();
        // Assuming the new API returns raw transactions
        const rawTransactions = data.rawTransactions || [];
        setRawMonthlyInvestments(rawTransactions);
        dataCache.current[cacheKey] = { rawTransactions };
      } catch (error) {
        setInvestmentsError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setIsInvestmentsLoading(false);
      }
    }
    fetchInvestments();
  }, [selectedInvestmentMonth, selectedInvestmentYear]);

    useEffect(() => {
    async function fetchTotalInvestments() {
      setIsTotalInvestmentsLoading(true); setTotalInvestmentsError(null);
      try {
        const res = await fetch(`/api/total-investments`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch total investments');
        const data = await res.json();
        // Get raw transactions only (investment accounts fetched separately)
        const rawTransactions = data.rawTransactions || [];
        setTotalInvestments(rawTransactions);
      } catch (error) {
        setTotalInvestmentsError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setIsTotalInvestmentsLoading(false);
      }
    }
    fetchTotalInvestments();
  }, []);

  useEffect(() => {
    async function fetchSummaryData() {
      const cacheKey = `summary-${selectedSummaryYear}`;
      if (dataCache.current[cacheKey]) {
        setApiSummaryData(dataCache.current[cacheKey].summaryData);
        setIsSummaryLoading(false);
        return;
      }
      setIsSummaryLoading(true); setSummaryError(null);
      try {
        const res = await fetch(`/api/yearly-summary?year=${selectedSummaryYear}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
        const data = await res.json();
        const summary = {
          summaryData: data.summaryData || [],
        };
        setApiSummaryData(summary.summaryData);
        dataCache.current[cacheKey] = summary;
      } catch (error) {
        setSummaryError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setIsSummaryLoading(false);
      }
    }
    fetchSummaryData();
  }, [selectedSummaryYear]);

  const fetchFriendsBalance = useCallback(async (forceRefresh: boolean = false) => {
    setIsFriendsBalanceLoading(true);
    setFriendsBalanceError(null);
    try {
      const url = forceRefresh ? '/api/friends-balance?refresh=true' : '/api/friends-balance';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to fetch friends balance');
      }
      const data = await res.json();
      setFriendsBalance(data.friends || []);
    } catch (error) {
      setFriendsBalanceError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsFriendsBalanceLoading(false);
    }
  }, []);

  // --- Event Handlers ---
  const handleOpenSplitwiseDialog = useCallback(async () => {
    setIsSplitwiseDialogOpen(true);
    await fetchFriendsBalance();
  }, [fetchFriendsBalance]);

  const handleRefreshSplitwiseData = useCallback(async () => {
    await fetchFriendsBalance(true); // Force refresh
  }, [fetchFriendsBalance]);

  const handleSyncSplitwise = useCallback(async () => {
    try {
      const response = await fetch('/api/splitwise-sync');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync Splitwise data');
      }

      const data = await response.json();
      console.log('Splitwise sync result:', data);
      
      // After successful sync, refresh the friends balance data
      await fetchFriendsBalance(true);
      
      // You can show a success message here if needed
      alert(`Successfully synced ${data.notificationsCount} notification(s) from Splitwise.`);
      
    } catch (error) {
      console.error('Error syncing Splitwise:', error);
      alert('Failed to sync Splitwise data. Please try again.');
    }
  }, [fetchFriendsBalance]);

  const handleViewBankTransactions = async (account: BankAccount) => {
    setTransactionDialogTitle(`All Transactions for ${account.name}`);
    setSelectedAccountId(account.id);
    setTransactionEntityType('bank');
    setTransactionPage(1);
    setIsTransactionDialogOpen(true);
    setIsTransactionsLoading(true);
    setTransactionsError(null);
    setTransactions([]);
    setAllFetchedTransactions([]);
    setTransactionCategoryFilter('all');

    try {
      const res = await fetch(`/api/bank-transactions?bankAccountId=${account.id}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch transactions');
      }
      const data = await res.json();
      const fetchedTransactions = data.transactions || [];
      setAllFetchedTransactions(fetchedTransactions);
      setTransactions(fetchedTransactions.slice(0, 20));
    } catch (error) {
      setTransactionsError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsTransactionsLoading(false);
    }
  };

  const handleLoadMoreTransactions = async () => {
      if (isFetchingMoreTransactions) return;
      setIsFetchingMoreTransactions(true);
      const nextPage = transactionPage + 1;
      const filteredSource = transactionCategoryFilter === 'all'
            ? allFetchedTransactions
            : allFetchedTransactions.filter(tx => tx.category === transactionCategoryFilter);
      const newTransactions = filteredSource.slice(0, nextPage * 20);
      setTransactions(newTransactions);
      setTransactionPage(nextPage);
      setIsFetchingMoreTransactions(false);
  };
  
  const handleViewCreditCardTransactions = async (card: CreditCardAccount) => {
    setTransactionDialogTitle(`All Transactions for ${card.name}`);
    setSelectedAccountId(card.id);
    setTransactionEntityType('credit-card');
    setTransactionPage(1);
    setIsTransactionDialogOpen(true);
    setIsTransactionsLoading(true);
    setTransactionsError(null);
    setTransactions([]);
    setAllFetchedTransactions([]);
    setTransactionCategoryFilter('all');

    try {
      const res = await fetch(`/api/credit-card-transactions?creditCardId=${card.id}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch transactions');
      }
      const data = await res.json();
      const fetchedTransactions = data.transactions || [];
      setAllFetchedTransactions(fetchedTransactions);
      setTransactions(fetchedTransactions.slice(0, 20));
    } catch (error) {
      setTransactionsError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsTransactionsLoading(false);
    }
  };

  const handleViewMonthlyTransactions = (
    title: string,
    sourceData: Transaction[],
    type: 'Income' | 'Expense' | 'Transfer' | 'Investment'
  ) => {
    setTransactionDialogTitle(title);
    setIsTransactionDialogOpen(true);
    setIsTransactionsLoading(false);
    setTransactionsError(null);
    setTransactions(sourceData.slice(0, 20));
    setAllFetchedTransactions(sourceData);
    setTransactionPage(1);
    setTransactionCategoryFilter('all');
    setTransactionEntityType(null);
  };

  // --- Memoized Data Transformations ---

  // Build full expense categories with nested subcategories from existing data
  // Using the same expenseCategories and expenseSubCategories from AddExpenseDialog
  const fullExpenseCategories = useMemo(() => {
    if (!expenseCategories || expenseCategories.length === 0) return [];
    
    return expenseCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      type: 1, // Expense type
      budget: 0,
      subcategories: expenseSubCategories
        .filter(sub => sub.categoryId === cat.id)
        .map(sub => ({
          id: sub.id,
          name: sub.name,
          budget: 0
        }))
    }));
  }, [expenseCategories, expenseSubCategories]);

  const apiMonthlyExpenses = useMemo(() => {
    if (!rawMonthlyExpenses) return [];
    const filteredTransactions = rawMonthlyExpenses.filter(tx => !excludedExpenseIds.has(tx.id));
    return groupTransactions(filteredTransactions, selectedExpenseMonth, selectedExpenseYear);
  }, [rawMonthlyExpenses, excludedExpenseIds, selectedExpenseMonth, selectedExpenseYear]);
  
  const apiMonthlyIncome = useMemo(() => {
    if (!rawMonthlyIncome) return [];
    return groupTransactions(rawMonthlyIncome, selectedIncomeMonth, selectedIncomeYear);
  }, [rawMonthlyIncome, selectedIncomeMonth, selectedIncomeYear]);

  const apiMonthlyInvestments = useMemo(() => {
    if (!rawMonthlyInvestments) return [];
    return groupTransactions(rawMonthlyInvestments, selectedInvestmentMonth, selectedInvestmentYear);
  }, [rawMonthlyInvestments, selectedInvestmentMonth, selectedInvestmentYear]);

  const financialSnapshotTableData = useMemo(() => {
    const monthIndex = monthOptions.findIndex(m => m.value === selectedSummaryDetailMonth);
    const summaryForMonth = apiSummaryData[monthIndex];

    let expenseForSelectedMonth = summaryForMonth?.expense || 0;
    // If the user is looking at the same month/year for expenses and netflow,
    // use the dynamically calculated expense total which respects exclusions.
    if (selectedExpenseMonth === selectedSummaryDetailMonth && selectedExpenseYear === selectedSummaryYear) {
      expenseForSelectedMonth = apiMonthlyExpenses.reduce((total, item) => total + parseCurrency(item.expense), 0);
    }
    
    const incomeForSelectedMonth = summaryForMonth?.income || 0;
    
    // Similarly, use dynamically calculated investment total if viewing the same period
    let investmentForSelectedMonth = summaryForMonth?.investment || 0;
    if (selectedInvestmentMonth === selectedSummaryDetailMonth && selectedInvestmentYear === selectedSummaryYear) {
      investmentForSelectedMonth = apiMonthlyInvestments.reduce((total, item) => total + parseCurrency(item.expense), 0);
    }


    const netFlows = incomeForSelectedMonth - expenseForSelectedMonth - investmentForSelectedMonth;
    
    let netFlowsColorClass = "text-foreground";
    if (netFlows > 0) netFlowsColorClass = "text-green-600";
    else if (netFlows < 0) netFlowsColorClass = "text-red-600";

    const hdfcAccount = apiBankAccounts.find(acc => acc.name.toLowerCase().includes('hdfc'));
    const hdfcBankBalance = hdfcAccount?.balance || 0;

    return [
      { category: "Total Expense", amount: expenseForSelectedMonth, colorClassName: "text-red-600 font-medium" },
      { category: "Total Income", amount: incomeForSelectedMonth, colorClassName: "text-green-600 font-medium" },
      { category: "Total Investment", amount: investmentForSelectedMonth, colorClassName: "text-primary font-medium" },
      { category: "HDFC Bank Balance", amount: hdfcBankBalance, colorClassName: "text-foreground font-medium" },
      { category: "Total Netflows", amount: netFlows, colorClassName: `${netFlowsColorClass} font-medium` },
    ] as FinancialSnapshotItem[];
  }, [selectedSummaryDetailMonth, apiSummaryData, apiBankAccounts, apiMonthlyExpenses, apiMonthlyInvestments, selectedExpenseMonth, selectedExpenseYear, selectedInvestmentMonth, selectedInvestmentYear, selectedSummaryYear]);

  useEffect(() => {
    const filteredSource = transactionCategoryFilter === 'all'
      ? allFetchedTransactions
      : allFetchedTransactions.filter(tx => tx.category === transactionCategoryFilter);
    
    setTransactions(filteredSource.slice(0, transactionPage * 20));
  }, [transactionCategoryFilter, allFetchedTransactions, transactionPage]);

  const renderError = (error: string | null, type: string) => {
    if (!error) return null;
    return (
        <div className="text-red-600 flex items-center justify-center p-4 bg-red-50 rounded-md my-4">
            <AlertCircle className="h-5 w-5 mr-2" />
            Error loading {type}: {error}
        </div>
    );
  };
  
  const hasMoreTransactions = useMemo(() => {
    const filteredSource = transactionCategoryFilter === 'all'
      ? allFetchedTransactions
      : allFetchedTransactions.filter(tx => tx.category === transactionCategoryFilter);
    return transactions.length < filteredSource.length;
  }, [transactions, allFetchedTransactions, transactionCategoryFilter]);

  return (
    <div className="flex flex-col min-h-screen w-full">
      <DashboardHeader 
        expenseCategories={expenseCategories}
        expenseSubCategories={expenseSubCategories}
        incomeCategories={incomeCategories}
        incomeSubCategories={incomeSubCategories}
        investmentCategories={investmentCategories}
        bankAccounts={apiBankAccounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          type: 'Bank' as const,
          balance: acc.balance
        }))}
        creditCards={apiCreditCards.map(card => ({
          id: card.id,
          name: card.name,
          type: 'Credit Card' as const,
          usedAmount: card.usedAmount,
          totalLimit: card.totalLimit
        }))}
        onExpenseAdded={handleExpenseAdded}
        onIncomeAdded={handleIncomeAdded}
        onInvestmentAdded={handleInvestmentAdded}
        onPaymentMade={handlePaymentMade}
        onOpenSplitwiseDialog={handleOpenSplitwiseDialog}
      />
      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-3">Bank Details</h2>
            <div className="bg-muted p-4 rounded-lg shadow-md">
              {isBankDetailsLoading && <p className="text-center text-muted-foreground">Loading bank details...</p>}
              {renderError(bankDetailsError, "bank details")}
              {!isBankDetailsLoading && !bankDetailsError && apiBankAccounts.length === 0 && <p className="text-center text-muted-foreground">No bank accounts found.</p>}
              {!isBankDetailsLoading && !bankDetailsError && apiBankAccounts.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  {apiBankAccounts.slice().sort((a, b) => b.balance - a.balance).map((account) => (
                    <StatCard key={account.id} logo={account.logo} bankName={account.name} currentBalanceText={`Current Balance : ${account.balance.toLocaleString('en-IN')}`} onViewTransactions={() => handleViewBankTransactions(account)} />
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-3">Credit card details</h2>
            <div className="bg-muted p-4 rounded-lg shadow-md">
              {isCreditCardDetailsLoading && <p className="text-center text-muted-foreground">Loading credit card details...</p>}
              {renderError(creditCardDetailsError, "credit card details")}
              {!isCreditCardDetailsLoading && !creditCardDetailsError && apiCreditCards.length === 0 && <p className="text-center text-muted-foreground">No credit cards found.</p>}
              {!isCreditCardDetailsLoading && !creditCardDetailsError && apiCreditCards.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  {apiCreditCards.map((card) => (
                    <StatCard key={card.id} creditCardLogoIcon={card.logo} creditCardName={card.name} usedAmountText={`Used : ${card.usedAmount.toLocaleString('en-IN')}`} totalLimitText={`Total Limit : ${card.totalLimit.toLocaleString('en-IN')}`} onViewTransactions={() => handleViewCreditCardTransactions(card)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Monthly Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                {isExpensesLoading && <p className="text-muted-foreground py-4">Loading expense data...</p>}
                {renderError(expensesError, "expense data")}
                {!isExpensesLoading && !expensesError && (
                    <ExpenseBreakdownTable 
                      key="expenses"
                      title="Expense Breakdown" 
                      selectedMonth={selectedExpenseMonth} 
                      onMonthChange={setSelectedExpenseMonth} 
                      months={monthOptions} 
                      selectedYear={selectedExpenseYear} 
                      onYearChange={setSelectedExpenseYear} 
                      years={availableYears} 
                      data={apiMonthlyExpenses}
                      showSubCategoryColumn={true}
                      onViewTransactions={() => handleViewMonthlyTransactions(
                        `${monthOptions.find(m => m.value === selectedExpenseMonth)?.label} ${selectedExpenseYear} Expenses`,
                        rawMonthlyExpenses,
                        'Expense'
                      )}
                    />
                )}
            </div>
            <div>
              {isIncomeLoading && <p className="text-muted-foreground py-4">Loading income data...</p>}
              {renderError(incomeError, "income data")}
              {!isIncomeLoading && !incomeError && (
                <ExpenseBreakdownTable
                  key="income"
                  title="Income Breakdown" 
                  selectedMonth={selectedIncomeMonth} 
                  onMonthChange={setSelectedIncomeMonth} 
                  months={monthOptions} 
                  selectedYear={selectedIncomeYear} 
                  onYearChange={setSelectedIncomeYear} 
                  years={availableYears} 
                  data={apiMonthlyIncome} 
                  amountColumnHeaderText="Income" 
                  amountColumnItemTextColorClassName="text-green-600 font-medium" 
                  categoryTotalTextColorClassName="text-green-700 font-semibold" 
                  grandTotalTextColorClassName="text-green-700"
                  showSubCategoryColumn={true}
                  onViewTransactions={() => handleViewMonthlyTransactions(
                    `${monthOptions.find(m => m.value === selectedIncomeMonth)?.label} ${selectedIncomeYear} Income`,
                    rawMonthlyIncome,
                    'Income'
                  )}
                />
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Total Investmented Details</h2>
            {isTotalInvestmentsLoading && <p className="text-muted-foreground py-4">Loading total investment data...</p>}
            {renderError(totalInvestmentsError, "investment data")}
              {!isTotalInvestmentsLoading && !totalInvestmentsError && (
              <ExpenseBreakdownTable 
                key="total-investments"
                title="Total Investment Breakdown" 
                data={totalInvestments.map(tx => ({
                  year: tx.date ? new Date(tx.date).getFullYear() : 0,
                  month: tx.date ? monthOptions[new Date(tx.date).getMonth()].value : '',
                  category: tx.category || 'Uncategorized',
                  subCategory: tx.subCategory || 'Uncategorized',
                  expense: `₹${tx.amount?.toFixed(2) ?? '0.00'}`,
                  xirr: getXIRRForTransaction(tx) // Use calculated XIRR data
                }))}
                amountColumnHeaderText="Investment" 
                amountColumnItemTextColorClassName="text-primary font-medium" 
                categoryTotalTextColorClassName="text-primary font-semibold" 
                grandTotalTextColorClassName="text-primary" 
                showSubCategoryColumn={false} 
                showCategoryTotalRow={false}
                showXirrColumn={true} // Enable XIRR column
                isXirrLoading={isXirrLoading} // Pass XIRR loading state
                hasXirrBeenCalculated={hasXirrBeenCalculated} // Pass calculated state
                onOpenCalculators={handleCalculateXIRR} // Open calculator dialog when clicked
              />
            )}
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Investment Details</h2>
            {isInvestmentsLoading && <p className="text-muted-foreground py-4">Loading investment data...</p>}
            {renderError(investmentsError, "investment data")}
            {!isInvestmentsLoading && !investmentsError && (
              <ExpenseBreakdownTable 
                key="monthly-investments"
                title="Investment Breakdown" 
                selectedMonth={selectedInvestmentMonth} 
                onMonthChange={setSelectedInvestmentMonth} 
                months={monthOptions} 
                selectedYear={selectedInvestmentYear} 
                onYearChange={setSelectedInvestmentYear} 
                years={availableYears} 
                data={apiMonthlyInvestments} 
                amountColumnHeaderText="Investment" 
                amountColumnItemTextColorClassName="text-primary font-medium" 
                categoryTotalTextColorClassName="text-primary font-semibold" 
                grandTotalTextColorClassName="text-primary" 
                showSubCategoryColumn={false} 
                showCategoryTotalRow={false} 
                onViewTransactions={() => handleViewMonthlyTransactions(
                  `${monthOptions.find(m => m.value === selectedInvestmentMonth)?.label} ${selectedInvestmentYear} Investments`,
                  rawMonthlyInvestments,
                  'Investment'
                )}
              />
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-10 gap-6">
          <div className="lg:col-span-7">
            <h2 className="text-xl font-semibold mb-4">Monthly Financial Summary Chart</h2>
            {isSummaryLoading && <p className="text-muted-foreground py-4">Loading summary data...</p>}
            {renderError(summaryError, "summary data")}
            {!isSummaryLoading && !summaryError && (
              <MonthlySummaryChart data={apiSummaryData} selectedYear={selectedSummaryYear} onYearChange={setSelectedSummaryYear} years={availableYears} />
            )}
          </div>
          <div className="lg:col-span-3">
            <h2 className="text-xl font-semibold mb-4">Month Netflow</h2>
            {isSummaryLoading && <p className="text-muted-foreground py-4">Loading netflow data...</p>}
            {renderError(summaryError, "netflow data")}
            {!isSummaryLoading && !summaryError && (
              <MonthlyMoneyTable data={financialSnapshotTableData} selectedMonth={selectedSummaryDetailMonth} onMonthChange={setSelectedSummaryDetailMonth} months={monthOptions} selectedYear={selectedSummaryYear} onYearChange={setSelectedSummaryYear} years={availableYears} />
            )}
          </div>
        </div>
      </main>
      <TransactionDialog
        open={isTransactionDialogOpen}
        onOpenChange={(isOpen) => {
          setIsTransactionDialogOpen(isOpen);
          if (!isOpen) {
            setSelectedAccountId(null);
            setTransactionDialogTitle(null);
            setTransactionEntityType(null);
          }
        }}
        transactions={transactions}
        title={transactionDialogTitle}
        isLoading={isTransactionsLoading}
        error={transactionsError}
        onLoadMore={handleLoadMoreTransactions}
        hasMore={hasMoreTransactions}
        isLoadingMore={isFetchingMoreTransactions}
        isExcludable={transactionDialogTitle?.includes('Expenses')}
        excludedIds={excludedExpenseIds}
        onToggleExclude={handleToggleExcludeTransaction}
        onClearExclusions={handleClearExclusions}
        categories={expenseCategories}
        categoryFilter={transactionCategoryFilter}
        onCategoryFilterChange={(value) => {
          setTransactionCategoryFilter(value);
          setTransactionPage(1); // Reset page when filter changes
        }}
      />
      <InvestmentCalculatorDialog 
        open={isInvestmentCalculatorOpen}
        onOpenChange={setIsInvestmentCalculatorOpen}
        investmentAccounts={investmentCategories}
        onXirrCalculated={handleXirrCalculated}
      />
      <SplitwiseDialog
        open={isSplitwiseDialogOpen}
        onOpenChange={setIsSplitwiseDialogOpen}
        data={friendsBalance}
        isLoading={isFriendsBalanceLoading}
        error={friendsBalanceError}
        onRefresh={handleRefreshSplitwiseData}
        onSync={handleSyncSplitwise}
        bankAccounts={apiBankAccounts.map(account => ({
          id: account.id,
          name: account.name,
        }))}
        categories={fullExpenseCategories}
      />
    </div>
  );
}

    
