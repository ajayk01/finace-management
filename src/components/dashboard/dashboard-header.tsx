
"use client"
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import { AddExpenseDialog } from './add-expense-dialog';
import { AddIncomeDialog } from './add-income-dialog';
import { AddInvestmentDialog } from './add-investment-dialog';
import { PayCCBillDialog } from './pay-cc-bill-dialog';
import { AddAccountDialog } from './add-account-dialog';
import { AddTransferDialog } from './add-transfer-dialog';
import { UnauditedExpenseDialog } from './unaudited-expense-dialog';
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
  const [isAddCapOpen, setIsAddCapOpen] = useState(false);
  const [isUnauditedExpenseOpen, setIsUnauditedExpenseOpen] = useState(false);

  const [selectedCreditCardForCap, setSelectedCreditCardForCap] = useState<string>('');
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
                    <DropdownMenuItem onClick={() => setIsAddCapOpen(true)}>Add Cap</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/splitwise')}>Splitwise</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onOpenAllTransactionsDialog}>Get All Transactions</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsUnauditedExpenseOpen(true)}>Unaudited Expense</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsPayCCBillOpen(true)}>Pay CC bill</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/mf-investments')}>Check MF Investment</DropdownMenuItem>
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
      <UnauditedExpenseDialog
        open={isUnauditedExpenseOpen}
        onOpenChange={setIsUnauditedExpenseOpen}
        expenseCategories={expenseCategories}
        expenseSubCategories={expenseSubCategories}
      />
      <AddCapHeaderDialog
        open={isAddCapOpen}
        onOpenChange={setIsAddCapOpen}
        creditCards={creditCards}
      />
    </>
  );
}

// Add Cap Dialog Component for Header
function AddCapHeaderDialog({ 
  open, 
  onOpenChange,
  creditCards
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  creditCards: Account[];
}) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const capSchema = z.object({
    creditCardId: z.string().min(1, 'Please select a credit card.'),
    capName: z.string().min(1, 'Cap name is required.'),
    capTotalAmount: z.coerce.number().min(1, 'Total amount must be greater than 0.'),
    capPercentage: z.coerce.number().min(0).max(100, 'Percentage must be between 0 and 100.'),
  });

  const capForm = useForm<z.infer<typeof capSchema>>({
    resolver: zodResolver(capSchema),
    defaultValues: {
      creditCardId: '',
      capName: '',
      capTotalAmount: '' as any,
      capPercentage: '' as any,
    },
  });

  const handleSubmit = async (values: z.infer<typeof capSchema>) => {
    setIsLoading(true);
    try {
      console.log('Submitting cap values:', values);
      console.log('Values type:', typeof values.creditCardId, typeof values.capTotalAmount, typeof values.capPercentage);
      
      const response = await fetch('/api/credit-card-caps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        console.error('Submitted values were:', values);
        throw new Error(errorData.error || 'Failed to add credit card cap');
      }

      toast({
        title: 'Cap Added',
        description: `Credit card cap "${values.capName}" has been successfully added.`,
      });

      capForm.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding cap:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add credit card cap.";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    capForm.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Credit Card Cap</DialogTitle>
          <DialogDescription>
            Create a new spending cap for a credit card.
          </DialogDescription>
        </DialogHeader>
        <Form {...capForm}>
          <form onSubmit={capForm.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={capForm.control}
              name="creditCardId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Credit Card</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a credit card" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {creditCards.map(card => (
                        <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={capForm.control}
              name="capName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cap Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Fuel, Groceries, Entertainment" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={capForm.control}
              name="capTotalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Cap Amount</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={capForm.control}
              name="capPercentage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cap Percentage (%)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" min="0" max="100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Adding...' : 'Add Cap'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}