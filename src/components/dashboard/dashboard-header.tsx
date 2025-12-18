
"use client"
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { LogOut, User, PlusCircle, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { AddExpenseDialog } from './add-expense-dialog';
import { AddIncomeDialog } from './add-income-dialog';
import { AddInvestmentDialog } from './add-investment-dialog';
import { PayCCBillDialog } from './pay-cc-bill-dialog';
import { AddAccountDialog } from './add-account-dialog';
import { AddTransferDialog } from './add-transfer-dialog';
import type { Category, SubCategory, Account } from './add-expense-dialog';
import type { SplitwiseGroup } from './add-expense-dialog';
import type { InvestmentCategory } from './add-investment-dialog';
import type { Transaction } from '@/app/page';

interface User {
  username: string;
}

interface DashboardHeaderProps {
  expenseCategories: Category[];
  expenseSubCategories: SubCategory[];
  incomeCategories: Category[];
  incomeSubCategories: SubCategory[];
  investmentCategories: InvestmentCategory[];
  bankAccounts: Account[];
  creditCards: Account[];
  onExpenseAdded: (newExpense: Transaction, accountId: string, accountType: 'Bank' | 'Credit Card') => void;
  onIncomeAdded: (newIncome: Transaction, accountId: string, accountType: 'Bank' | 'Credit Card') => void;
  onInvestmentAdded: (newInvestment: Transaction, fromAccountId: string) => void;
  onPaymentMade: (payment: Transaction, fromBankId: string, toCreditCardId: string, amount: number) => void;
  onTransferAdded?: (newTransfer: Transaction, fromAccountId: string, toAccountId: string) => void;
  onOpenSplitwiseDialog: () => void;
  onOpenAllTransactionsDialog?: () => void;
}

export function DashboardHeader({ 
    expenseCategories, 
    expenseSubCategories,
    incomeCategories,
    incomeSubCategories,
    investmentCategories,
    bankAccounts, 
    creditCards,
    onExpenseAdded,
    onIncomeAdded,
    onInvestmentAdded,
    onPaymentMade,
    onTransferAdded,
    onOpenSplitwiseDialog,
    onOpenAllTransactionsDialog
}: DashboardHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [isAddInvestmentOpen, setIsAddInvestmentOpen] = useState(false);
  const [isPayCCBillOpen, setIsPayCCBillOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddTransferOpen, setIsAddTransferOpen] = useState(false);
  const [splitwiseGroups, setSplitwiseGroups] = useState<SplitwiseGroup[]>([]);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/user');
        const data = await res.json();
        if (data.isLoggedIn) {
          setUser({ username: data.username });
        }
      } catch (error) {
        console.error("Failed to fetch user", error);
      }
    }
    async function fetchSplitwiseGroups() {
        try {
            const res = await fetch('/api/splitwise');
            const data = await res.json();
            if (res.ok) {
                setSplitwiseGroups(data.groups || []);
            } else {
                console.error("Failed to fetch splitwise groups", data.error);
            }
        } catch(error) {
            console.error("Failed to fetch splitwise groups", error);
        }
    }
    fetchUser();
    fetchSplitwiseGroups();
  }, [toast]);
  
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out.",
      });
      router.push('/login');
      router.refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Logout Failed",
        description: "An error occurred during logout. Please try again.",
      });
    }
  };

  const combinedAccounts = [
    ...bankAccounts.map(acc => ({ ...acc, type: "Bank" as const })),
    ...creditCards.map(card => ({ ...card, type: "Credit Card" as const }))
  ];
  
  const bankAccountsOnly = bankAccounts.map(acc => ({ ...acc, type: "Bank" as const }));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <h1 className="text-xl font-semibold md:text-2xl">Financial Dashboard</h1>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
            <Button variant="outline" size="sm" onClick={() => setIsAddExpenseOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Expense
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsAddIncomeOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Income
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsAddInvestmentOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Investment
            </Button>
          
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                        More options <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsAddAccountOpen(true)}>Add Account</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsAddTransferOpen(true)}>Add Transfer</DropdownMenuItem>
                    <DropdownMenuItem onClick={onOpenSplitwiseDialog}>Splitwise</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onOpenAllTransactionsDialog}>Get All Transactions</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsPayCCBillOpen(true)}>Pay CC bill</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>


            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                <User className="h-5 w-5" />
                <span className="sr-only">User menu</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user ? user.username : 'My Account'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </header>
      <AddExpenseDialog 
        open={isAddExpenseOpen} 
        onOpenChange={setIsAddExpenseOpen}
        categories={expenseCategories}
        subCategories={expenseSubCategories}
        accounts={combinedAccounts}
        onExpenseAdded={onExpenseAdded}
      />
       <AddIncomeDialog 
        open={isAddIncomeOpen} 
        onOpenChange={setIsAddIncomeOpen}
        categories={incomeCategories}
        subCategories={incomeSubCategories}
        accounts={combinedAccounts}
        onIncomeAdded={onIncomeAdded}
      />
      <AddInvestmentDialog
        open={isAddInvestmentOpen}
        onOpenChange={setIsAddInvestmentOpen}
        investmentCategories={investmentCategories}
        accounts={bankAccountsOnly}
        onInvestmentAdded={onInvestmentAdded}
      />
      <PayCCBillDialog
        open={isPayCCBillOpen}
        onOpenChange={setIsPayCCBillOpen}
        creditCards={creditCards.map(card => ({
          id: card.id,
          name: card.name,
          usedAmount: card.usedAmount || 0,
          totalLimit: card.totalLimit || 0,
        }))}
        bankAccounts={bankAccounts.map(account => ({
          id: account.id,
          name: account.name,
          balance: account.balance || 0,
        }))}
        onPaymentMade={onPaymentMade}
      />
      <AddAccountDialog
        open={isAddAccountOpen}
        onOpenChange={setIsAddAccountOpen}
        onAccountAdded={() => {
          // Refresh the page data or call a callback to update accounts list
          window.location.reload();
        }}
      />
      <AddTransferDialog
        open={isAddTransferOpen}
        onOpenChange={setIsAddTransferOpen}
        bankAccounts={bankAccountsOnly}
        onTransferAdded={onTransferAdded}
      />
    </>
  );
}