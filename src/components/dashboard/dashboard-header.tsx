
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
import type { Category, SubCategory, Account } from './add-expense-dialog';
import type { Transaction } from '@/app/page';

interface User {
  username: string;
}

interface DashboardHeaderProps {
  expenseCategories: Category[];
  expenseSubCategories: SubCategory[];
  incomeCategories: Category[];
  incomeSubCategories: SubCategory[];
  bankAccounts: Account[];
  creditCards: Account[];
  onExpenseAdded: (newExpense: Transaction, accountId: string, accountType: 'Bank' | 'Credit Card') => void;
  onIncomeAdded: (newIncome: Transaction, accountId: string, accountType: 'Bank' | 'Credit Card') => void;
}

export function DashboardHeader({ 
  expenseCategories, 
  expenseSubCategories, 
  incomeCategories,
  incomeSubCategories,
  bankAccounts, 
  creditCards, 
  onExpenseAdded,
  onIncomeAdded
}: DashboardHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);

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
    fetchUser();
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
            <Button variant="outline" size="sm">
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
                    <DropdownMenuItem>Splitwise</DropdownMenuItem>
                    <DropdownMenuItem>Pay CC bill</DropdownMenuItem>
                    <DropdownMenuItem>Settle up</DropdownMenuItem>
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
    </>
  );
}