
"use client"
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ExpenseBreakdownTable } from "@/components/dashboard/expense-breakdown-table";
import { ExpensePieChart } from "@/components/dashboard/expense-pie-chart";
import { MonthlySummaryChart } from "@/components/dashboard/monthly-summary-chart";
import { MonthlyMoneyTable, type FinancialSnapshotItem } from "@/components/dashboard/monthly-money-table";
import { TransactionDialog } from "@/components/dashboard/transaction-dialog"; // Import new component
import { AlertCircle } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from 'react';

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

interface Transaction {
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

  // Income State
  const [apiMonthlyIncome, setApiMonthlyIncome] = useState<ExpenseItem[]>([]);
  const [isIncomeLoading, setIsIncomeLoading] = useState<boolean>(true);
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const [selectedIncomeMonth, setSelectedIncomeMonth] = useState<string>(currentMonthValue);
  const [selectedIncomeYear, setSelectedIncomeYear] = useState<number>(currentYear);

  // Investments State
  const [apiMonthlyInvestments, setApiMonthlyInvestments] = useState<ExpenseItem[]>([]);
  const [isInvestmentsLoading, setIsInvestmentsLoading] = useState<boolean>(true);
  const [investmentsError, setInvestmentsError] = useState<string | null>(null);
  const [selectedInvestmentMonth, setSelectedInvestmentMonth] = useState<string>(currentMonthValue);
  const [selectedInvestmentYear, setSelectedInvestmentYear] = useState<number>(currentYear);

  // Summary Chart & Netflow State
  const [apiSummaryData, setApiSummaryData] = useState<SummaryDataItem[]>([]);
  const [totalBankBalance, setTotalBankBalance] = useState<number>(0);
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
  
  const availableYears = useMemo(() => getAvailableYears(), []);

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

  // --- Data Fetching Effects ---
  useEffect(() => {
    async function fetchBankDetails() {
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
    }
    fetchBankDetails();
  }, []);

  useEffect(() => {
    async function fetchCreditCardDetails() {
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
    }
    fetchCreditCardDetails();
  }, []);
  
  useEffect(() => {
    async function fetchExpenses() {
      const cacheKey = `expenses-${selectedExpenseYear}-${selectedExpenseMonth}`;
      if (dataCache.current[cacheKey]) {
        setRawMonthlyExpenses(dataCache.current[cacheKey].rawTransactions);
        setExcludedExpenseIds(new Set()); // Reset on month change
        return;
      }
      setIsExpensesLoading(true); setExpensesError(null);
      try {
        const res = await fetch(`/api/monthly-expenses?month=${selectedExpenseMonth}&year=${selectedExpenseYear}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
        const data = await res.json();
        const rawTransactions = data.rawTransactions || [];
        setRawMonthlyExpenses(rawTransactions);
        setExcludedExpenseIds(new Set()); // Reset on month change
        dataCache.current[cacheKey] = { rawTransactions };
      } catch (error) {
        setExpensesError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setIsExpensesLoading(false);
      }
    }
    fetchExpenses();
  }, [selectedExpenseMonth, selectedExpenseYear]);

  useEffect(() => {
    async function fetchIncome() {
      const cacheKey = `income-${selectedIncomeYear}-${selectedIncomeMonth}`;
      if (dataCache.current[cacheKey]) {
        setApiMonthlyIncome(dataCache.current[cacheKey]);
        return;
      }
      setIsIncomeLoading(true); setIncomeError(null);
      try {
        const res = await fetch(`/api/monthly-income?month=${selectedIncomeMonth}&year=${selectedIncomeYear}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
        const data = await res.json();
        const income = data.monthlyIncome || [];
        setApiMonthlyIncome(income);
        dataCache.current[cacheKey] = income;
      } catch (error) {
        setIncomeError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setIsIncomeLoading(false);
      }
    }
    fetchIncome();
  }, [selectedIncomeMonth, selectedIncomeYear]);

  useEffect(() => {
    async function fetchInvestments() {
      const cacheKey = `investments-${selectedInvestmentYear}-${selectedInvestmentMonth}`;
      if (dataCache.current[cacheKey]) {
        setApiMonthlyInvestments(dataCache.current[cacheKey]);
        return;
      }
      setIsInvestmentsLoading(true); setInvestmentsError(null);
      try {
        const res = await fetch(`/api/monthly-investments?month=${selectedInvestmentMonth}&year=${selectedInvestmentYear}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
        const data = await res.json();
        const investments = data.monthlyInvestments || [];
        setApiMonthlyInvestments(investments);
        dataCache.current[cacheKey] = investments;
      } catch (error) {
        setInvestmentsError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setIsInvestmentsLoading(false);
      }
    }
    fetchInvestments();
  }, [selectedInvestmentMonth, selectedInvestmentYear]);

  useEffect(() => {
    async function fetchSummaryData() {
      const cacheKey = `summary-${selectedSummaryYear}`;
      if (dataCache.current[cacheKey]) {
        setApiSummaryData(dataCache.current[cacheKey].summaryData);
        setTotalBankBalance(dataCache.current[cacheKey].totalBankBalance);
        return;
      }
      setIsSummaryLoading(true); setSummaryError(null);
      try {
        const res = await fetch(`/api/yearly-summary?year=${selectedSummaryYear}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
        const data = await res.json();
        const summary = {
          summaryData: data.summaryData || [],
          totalBankBalance: data.totalBankBalance || 0
        };
        setApiSummaryData(summary.summaryData);
        setTotalBankBalance(summary.totalBankBalance);
        dataCache.current[cacheKey] = summary;
      } catch (error) {
        setSummaryError(error instanceof Error ? error.message : "An unknown error occurred");
      } finally {
        setIsSummaryLoading(false);
      }
    }
    fetchSummaryData();
  }, [selectedSummaryYear]);


  // --- Event Handlers ---
  const handleViewBankTransactions = async (account: BankAccount) => {
    setTransactionDialogTitle(`${account.name} Transactions`);
    setSelectedAccountId(account.id);
    setTransactionEntityType('bank');
    setTransactionPage(1);
    setIsTransactionDialogOpen(true);
    setIsTransactionsLoading(true);
    setTransactionsError(null);
    setTransactions([]);
    setAllFetchedTransactions([]);

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
      const newTransactions = allFetchedTransactions.slice(0, nextPage * 20);
      setTransactions(newTransactions);
      setTransactionPage(nextPage);
      setIsFetchingMoreTransactions(false);
  };
  
  const handleViewCreditCardTransactions = async (card: CreditCardAccount) => {
    setTransactionDialogTitle(`${card.name} Transactions`);
    setSelectedAccountId(card.id);
    setTransactionEntityType('credit-card');
    setTransactionPage(1);
    setIsTransactionDialogOpen(true);
    setIsTransactionsLoading(true);
    setTransactionsError(null);
    setTransactions([]);
    setAllFetchedTransactions([]);

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
    sourceData: any[],
    type: 'Income' | 'Expense' | 'Transfer'
  ) => {
    setTransactionDialogTitle(title);
    setIsTransactionDialogOpen(true);
    setTransactionsError(null);
    setTransactions([]);
    setAllFetchedTransactions([]);
    setTransactionPage(1);

    // For 'Expense', the sourceData is now the raw transactions array.
    if (type === 'Expense') {
      setIsTransactionsLoading(false);
      const allTxs = sourceData as Transaction[];
      setAllFetchedTransactions(allTxs);
      setTransactions(allTxs.slice(0, 20));
      return;
    }

    // For Income and Investments, we still use mock data generation.
    setIsTransactionsLoading(true);
    setTimeout(() => {
      if (sourceData.length === 0) {
        setTransactions([]);
        setIsTransactionsLoading(false);
        return;
      }

      const mockTransactions: Transaction[] = (sourceData as ExpenseItem[])
        .flatMap(item => ({
            id: `${type}-${item.category}-${item.subCategory}`,
            date: new Date().toISOString(),
            description: "Bank Charges By Bank......", // Mock description
            amount: parseCurrency(item.expense),
            type: type,
            category: item.category,
            subCategory: item.subCategory,
        }))
        .sort((a, b) => b.amount - a.amount);
      
      setAllFetchedTransactions(mockTransactions);
      setTransactions(mockTransactions.slice(0, 20));
      setIsTransactionsLoading(false);
    }, 1000);
  };

  // --- Memoized Data Transformations ---

  const apiMonthlyExpenses = useMemo(() => {
    if (!rawMonthlyExpenses) return [];
    const filteredTransactions = rawMonthlyExpenses.filter(tx => !excludedExpenseIds.has(tx.id));
    return groupTransactions(filteredTransactions, selectedExpenseMonth, selectedExpenseYear);
  }, [rawMonthlyExpenses, excludedExpenseIds, selectedExpenseMonth, selectedExpenseYear]);

  const currentMonthExpensePieData = useMemo(() => {
    const aggregated: { [key: string]: number } = {};
    apiMonthlyExpenses.forEach(item => {
      const value = parseCurrency(item.expense);
      if (aggregated[item.category]) {
        aggregated[item.category] += value;
      } else {
        aggregated[item.category] = value;
      }
    });
    return Object.entries(aggregated).map(([name, value]) => ({ name, value, fill: 'hsl(var(--chart-2))' }));
  }, [apiMonthlyExpenses]);
  
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
    const investmentForSelectedMonth = summaryForMonth?.investment || 0;

    const netFlows = incomeForSelectedMonth - expenseForSelectedMonth - investmentForSelectedMonth;
    
    let netFlowsColorClass = "text-foreground";
    if (netFlows > 0) netFlowsColorClass = "text-green-600";
    else if (netFlows < 0) netFlowsColorClass = "text-red-600";

    return [
      { category: "Total Expense", amount: expenseForSelectedMonth, colorClassName: "text-red-600 font-medium" },
      { category: "Total Income", amount: incomeForSelectedMonth, colorClassName: "text-green-600 font-medium" },
      { category: "Total Investment", amount: investmentForSelectedMonth, colorClassName: "text-primary font-medium" },
      { category: "Total Bank Balance", amount: totalBankBalance, colorClassName: "text-foreground font-medium" },
      { category: "Total Netflows", amount: netFlows, colorClassName: `${netFlowsColorClass} font-medium` },
    ] as FinancialSnapshotItem[];
  }, [selectedSummaryDetailMonth, apiSummaryData, totalBankBalance, apiMonthlyExpenses, selectedExpenseMonth, selectedExpenseYear, selectedSummaryYear]);

  const renderError = (error: string | null, type: string) => {
    if (!error) return null;
    return (
        <div className="text-red-600 flex items-center justify-center p-4 bg-red-50 rounded-md my-4">
            <AlertCircle className="h-5 w-5 mr-2" />
            Error loading {type}: {error}
        </div>
    );
  };
  
  const hasMoreTransactions = useMemo(() => transactions.length < allFetchedTransactions.length, [transactions, allFetchedTransactions]);

  return (
    <div className="flex flex-col min-h-screen w-full">
      <DashboardHeader />
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
          <h2 className="text-xl font-semibold mb-4">Monthly Expenses Overview</h2>
          {isExpensesLoading && <p className="text-muted-foreground py-4">Loading expense data...</p>}
          {renderError(expensesError, "expense data")}
          {!isExpensesLoading && !expensesError && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <ExpenseBreakdownTable 
                  title="Expense Breakdown" 
                  selectedMonth={selectedExpenseMonth} 
                  onMonthChange={setSelectedExpenseMonth} 
                  months={monthOptions} 
                  selectedYear={selectedExpenseYear} 
                  onYearChange={setSelectedExpenseYear} 
                  years={availableYears} 
                  data={apiMonthlyExpenses}
                  onViewTransactions={() => handleViewMonthlyTransactions(
                    `${monthOptions.find(m => m.value === selectedExpenseMonth)?.label} ${selectedExpenseYear} Expenses`,
                    rawMonthlyExpenses,
                    'Expense'
                  )}
                />
              </div>
              <div>
                <ExpensePieChart data={currentMonthExpensePieData} chartTitle="Selected Month Expense" chartDescription="Breakdown By Category" />
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Monthly Income Overview</h2>
            {isIncomeLoading && <p className="text-muted-foreground py-4">Loading income data...</p>}
            {renderError(incomeError, "income data")}
            {!isIncomeLoading && !incomeError && (
              <ExpenseBreakdownTable 
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
                onViewTransactions={() => handleViewMonthlyTransactions(
                  `${monthOptions.find(m => m.value === selectedIncomeMonth)?.label} ${selectedIncomeYear} Income`,
                  apiMonthlyIncome,
                  'Income'
                )}
              />
            )}
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Investment Details</h2>
            {isInvestmentsLoading && <p className="text-muted-foreground py-4">Loading investment data...</p>}
            {renderError(investmentsError, "investment data")}
            {!isInvestmentsLoading && !investmentsError && (
              <ExpenseBreakdownTable 
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
                  apiMonthlyInvestments,
                  'Transfer'
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
      />
    </div>
  );
}
