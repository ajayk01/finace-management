"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Loader2, Edit2, Trash2, Copy, X } from 'lucide-react';
import { format, parse } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { transaction } from '@/lib/db';

interface Transaction {
  id: string;
  date: string | null;
  description: string;
  amount: number;
  type: 'Income' | 'Expense' | 'Investment';
  category?: string;
  subCategory?: string;
  accountId?: string;
  accountName?: string;
  categoryId?: string;
  subCategoryId?: string;
  investmentAccountId?: string;
  investmentAccountName?: string;
}

interface Category {
  id: string;
  name: string;
}

interface SubCategory {
  id: string;
  name: string;
  categoryId: string;
}

interface Account {
  id: string;
  name: string;
  type: 'Bank' | 'Credit Card';
  balance?: number;
  usedAmount?: number;
  totalLimit?: number;
}

interface AllTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransactionUpdated?: () => void;
  expenseCategories: Category[];
  expenseSubCategories: SubCategory[];
  incomeCategories: Category[];
  incomeSubCategories: SubCategory[];
  bankAccounts: Account[];
  creditCards: Account[];
}

const expenseFormSchema = z.object({
  amount: z.string().min(1, 'Amount is required'),
  category: z.string().min(1, 'Category is required'),
  subCategory: z.string().optional(),
  account: z.string().min(1, 'Account is required'),
  date: z.date(),
  description: z.string().optional(),
});

const incomeFormSchema = z.object({
  amount: z.string().min(1, 'Amount is required'),
  category: z.string().min(1, 'Category is required'),
  subCategory: z.string().optional(),
  account: z.string().min(1, 'Account is required'),
  date: z.date(),
  description: z.string().optional(),
});

const investmentFormSchema = z.object({
  amount: z.string().min(1, 'Amount is required'),
  investmentAccount: z.string().min(1, 'Investment account is required'),
  account: z.string().min(1, 'Account is required'),
  date: z.date(),
  description: z.string().optional(),
});

export function AllTransactionsDialog({
  open,
  onOpenChange,
  onTransactionUpdated,
  expenseCategories,
  expenseSubCategories,
  incomeCategories,
  incomeSubCategories,
  bankAccounts,
  creditCards,
}: AllTransactionsDialogProps) {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDuplicatePreviewOpen, setIsDuplicatePreviewOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [investmentAccounts, setInvestmentAccounts] = useState<{ id: string; name: string }[]>([]);
  const [typeFilter, setTypeFilter] = useState<'All' | 'Income' | 'Expense' | 'Investment'>('All');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const monthMap = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return monthMap[new Date().getMonth()];
  });
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const combinedAccounts = [
    ...bankAccounts.map(acc => ({ ...acc, type: "Bank" as const })),
    ...creditCards.map(card => ({ ...card, type: "Credit Card" as const }))
  ];

  const expenseForm = useForm<z.infer<typeof expenseFormSchema>>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      amount: '',
      category: '',
      subCategory: '',
      account: '',
      date: new Date(),
      description: '',
    },
  });

  const incomeForm = useForm<z.infer<typeof incomeFormSchema>>({
    resolver: zodResolver(incomeFormSchema),
    defaultValues: {
      amount: '',
      category: '',
      subCategory: '',
      account: '',
      date: new Date(),
      description: '',
    },
  });

  const investmentForm = useForm<z.infer<typeof investmentFormSchema>>({
    resolver: zodResolver(investmentFormSchema),
    defaultValues: {
      amount: '',
      investmentAccount: '',
      account: '',
      date: new Date(),
      description: '',
    },
  });

  useEffect(() => {
    if (open) {
      fetchTransactions();
      fetchInvestmentAccounts();
    }
  }, [open, selectedMonth, selectedYear]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/all-transactions?month=${selectedMonth}&year=${selectedYear}`);
      const data = await res.json();

      if (res.ok) {
        setTransactions(data.transactions || []);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "Failed to fetch transactions",
        });
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while fetching transactions",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInvestmentAccounts = async () => {
    try {
      const res = await fetch('/api/investment-accounts');
      const data = await res.json();
      if (res.ok) {
        // API returns array directly, not wrapped in object
        setInvestmentAccounts(Array.isArray(data) ? data : []);
        console.log("Fetched investment accounts:", data);
      } else {
        console.error("Failed to fetch investment accounts:", data);
      }
    } catch (error) {
      console.error("Error fetching investment accounts:", error);
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    
    console.log('Editing transaction:', transaction);
    console.log('Investment Account ID:', transaction.investmentAccountId);
    
    if (transaction.type === 'Expense') {
      expenseForm.reset({
        amount: transaction.amount.toString(),
        category: transaction.categoryId || '',
        subCategory: transaction.subCategoryId || '',
        account: transaction.accountId || '',
        date: transaction.date ? parse(transaction.date, 'yyyy-MM-dd', new Date()) : new Date(),
        description: transaction.description,
      });
    } else if (transaction.type === 'Income') {
      incomeForm.reset({
        amount: transaction.amount.toString(),
        category: transaction.categoryId || '',
        subCategory: transaction.subCategoryId || '',
        account: transaction.accountId || '',
        date: transaction.date ? parse(transaction.date, 'yyyy-MM-dd', new Date()) : new Date(),
        description: transaction.description,
      });
    } else if (transaction.type === 'Investment') {
      console.log("Investment Accounts Array:", investmentAccounts);
      console.log("Looking for ID:", transaction.investmentAccountId);
      console.log("ID exists in array?", investmentAccounts.some(acc => acc.id === transaction.investmentAccountId));
      
      const formData = {
        amount: transaction.amount.toString(),
        investmentAccount: transaction.investmentAccountId || '',
        account: transaction.accountId || '',
        date: transaction.date ? parse(transaction.date, 'yyyy-MM-dd', new Date()) : new Date(),
        description: transaction.description,
      };
      console.log("Form data being set:", formData);
      
      investmentForm.reset(formData);
      
      // Log form value after reset
      setTimeout(() => {
        console.log("Form value after reset:", investmentForm.getValues('investmentAccount'));
      }, 100);
    }
    
    setIsEditDialogOpen(true);
  };

  const handleDuplicate = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    
    console.log('Duplicating transaction:', transaction);
    console.log('Investment Account ID:', transaction.investmentAccountId);
    
    if (transaction.type === 'Expense') {
      expenseForm.reset({
        amount: transaction.amount.toString(),
        category: transaction.categoryId || '',
        subCategory: transaction.subCategoryId || '',
        account: transaction.accountId || '',
        date: new Date(),
        description: transaction.description,
      });
    } else if (transaction.type === 'Income') {
      incomeForm.reset({
        amount: transaction.amount.toString(),
        category: transaction.categoryId || '',
        subCategory: transaction.subCategoryId || '',
        account: transaction.accountId || '',
        date: new Date(),
        description: transaction.description,
      });
    } else if (transaction.type === 'Investment') {
      investmentForm.reset({
        amount: transaction.amount.toString(),
        investmentAccount: transaction.investmentAccountId || '',
        account: transaction.accountId || '',
        date: new Date(),
        description: transaction.description,
      });
    }
    
    setIsDuplicatePreviewOpen(true);
  };

  const handleDeleteClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTransaction) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/all-transactions?id=${selectedTransaction.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Success",
          description: "Transaction deleted successfully",
        });
        fetchTransactions();
        onTransactionUpdated?.();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "Failed to delete transaction",
        });
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while deleting transaction",
      });
    } finally {
      setIsSaving(false);
      setDeleteConfirmOpen(false);
      setSelectedTransaction(null);
    }
  };

  const handleSaveEdit = async (values: any) => {
    if (!selectedTransaction) return;

    setIsSaving(true);
    try {
      let apiEndpoint = '';
      let payload: any = {};

      if (selectedTransaction.type === 'Expense') {
        apiEndpoint = '/api/add-expense';
        payload = {
          id: selectedTransaction.id,
          amount: parseFloat(values.amount),
          categoryId: values.category,
          subCategoryId: values.subCategory,
          accountId: values.account,
          date: format(values.date, 'yyyy-MM-dd'),
          description: values.description,
        };
      } else if (selectedTransaction.type === 'Income') {
        apiEndpoint = '/api/add-income';
        payload = {
          id: selectedTransaction.id,
          amount: parseFloat(values.amount),
          categoryId: values.category,
          subCategoryId: values.subCategory,
          accountId: values.account,
          date: format(values.date, 'yyyy-MM-dd'),
          description: values.description,
        };
      } else if (selectedTransaction.type === 'Investment') {
        apiEndpoint = '/api/add-investment';
        payload = {
          id: selectedTransaction.id,
          amount: parseFloat(values.amount),
          investmentAccountId: values.investmentAccount,
          fromAccountId: values.account,
          date: format(values.date, 'yyyy-MM-dd'),
          description: values.description,
        };
      }

      const res = await fetch(apiEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Success",
          description: "Transaction updated successfully",
        });
        fetchTransactions();
        onTransactionUpdated?.();
        setIsEditDialogOpen(false);
        setSelectedTransaction(null);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "Failed to update transaction",
        });
      }
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while updating transaction",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDuplicate = async (values: any) => {
    if (!selectedTransaction) return;

    setIsSaving(true);
    try {
      let apiEndpoint = '';
      let payload: any = {};

      if (selectedTransaction.type === 'Expense') {
        apiEndpoint = '/api/add-expense';
        const selectedAccount = combinedAccounts.find(acc => acc.id === values.account);
        payload = {
          amount: parseFloat(values.amount),
          categoryId: values.category,
          subCategoryId: values.subCategory,
          account: {
            id: values.account,
            type: selectedAccount?.type || 'Bank',
          },
          date: format(values.date, 'yyyy-MM-dd'),
          description: values.description,
        };
      } else if (selectedTransaction.type === 'Income') {
        apiEndpoint = '/api/add-income';
        const selectedAccount = combinedAccounts.find(acc => acc.id === values.account);
        payload = {
          amount: parseFloat(values.amount),
          categoryId: values.category,
          subCategoryId: values.subCategory,
          account: {
            id: values.account,
            type: selectedAccount?.type || 'Bank',
          },
          date: format(values.date, 'yyyy-MM-dd'),
          description: values.description,
        };
      } else if (selectedTransaction.type === 'Investment') {
        apiEndpoint = '/api/add-investment';
        payload = {
          amount: parseFloat(values.amount),
          investmentCategoryId: values.investmentAccount,
          accountId: values.account,
          date: format(values.date, 'yyyy-MM-dd'),
          description: values.description,
        };
      }

      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Success",
          description: "Transaction duplicated successfully",
        });
        fetchTransactions();
        onTransactionUpdated?.();
        setIsDuplicatePreviewOpen(false);
        setSelectedTransaction(null);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "Failed to duplicate transaction",
        });
      }
    } catch (error) {
      console.error("Error duplicating transaction:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while duplicating transaction",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'Income':
        return 'default';
      case 'Expense':
        return 'destructive';
      case 'Investment':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const renderEditForm = () => {
    if (!selectedTransaction) return null;

    if (selectedTransaction.type === 'Expense') {
      const categories = expenseCategories;
      const selectedCategoryId = expenseForm.watch('category');
      const filteredSubCategories = expenseSubCategories.filter(
        sub => sub.categoryId === selectedCategoryId
      );

      return (
        <Form {...expenseForm}>
          <form onSubmit={expenseForm.handleSubmit(handleSaveEdit)} className="space-y-4">
            <FormField
              control={expenseForm.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={expenseForm.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {filteredSubCategories.length > 0 && (
              <FormField
                control={expenseForm.control}
                name="subCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sub-category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredSubCategories.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={expenseForm.control}
              name="account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {combinedAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={expenseForm.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={expenseForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      );
    } else if (selectedTransaction.type === 'Income') {
      const categories = incomeCategories;
      const selectedCategoryId = incomeForm.watch('category');
      const filteredSubCategories = incomeSubCategories.filter(
        sub => sub.categoryId === selectedCategoryId
      );

      return (
        <Form {...incomeForm}>
          <form onSubmit={incomeForm.handleSubmit(handleSaveEdit)} className="space-y-4">
            <FormField
              control={incomeForm.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={incomeForm.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {filteredSubCategories.length > 0 && (
              <FormField
                control={incomeForm.control}
                name="subCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sub-category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredSubCategories.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={incomeForm.control}
              name="account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {combinedAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={incomeForm.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={incomeForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      );
    } else if (selectedTransaction.type === 'Investment') {
      return (
        <Form {...investmentForm}>
          <form onSubmit={investmentForm.handleSubmit(handleSaveEdit)} className="space-y-4">
            <FormField
              control={investmentForm.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={investmentForm.control}
              name="investmentAccount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Investment Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select investment account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {investmentAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={investmentForm.control}
              name="account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bankAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={investmentForm.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={investmentForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      );
    }
  };

  const renderDuplicateForm = () => {
    if (!selectedTransaction) return null;

    if (selectedTransaction.type === 'Expense') {
      const categories = expenseCategories;
      const selectedCategoryId = expenseForm.watch('category');
      const filteredSubCategories = expenseSubCategories.filter(
        sub => sub.categoryId === selectedCategoryId
      );

      return (
        <Form {...expenseForm}>
          <form onSubmit={expenseForm.handleSubmit(handleSaveDuplicate)} className="space-y-4">
            <div className="bg-muted p-4 rounded-md mb-4">
              <h4 className="text-sm font-semibold mb-2">Preview & Edit Before Duplicating</h4>
              <p className="text-sm text-muted-foreground">
                Review and modify the transaction details before creating a duplicate.
              </p>
            </div>
            <FormField
              control={expenseForm.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={expenseForm.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {filteredSubCategories.length > 0 && (
              <FormField
                control={expenseForm.control}
                name="subCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sub-category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredSubCategories.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={expenseForm.control}
              name="account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {combinedAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={expenseForm.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={expenseForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDuplicatePreviewOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Duplicate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      );
    } else if (selectedTransaction.type === 'Income') {
      const categories = incomeCategories;
      const selectedCategoryId = incomeForm.watch('category');
      const filteredSubCategories = incomeSubCategories.filter(
        sub => sub.categoryId === selectedCategoryId
      );

      return (
        <Form {...incomeForm}>
          <form onSubmit={incomeForm.handleSubmit(handleSaveDuplicate)} className="space-y-4">
            <div className="bg-muted p-4 rounded-md mb-4">
              <h4 className="text-sm font-semibold mb-2">Preview & Edit Before Duplicating</h4>
              <p className="text-sm text-muted-foreground">
                Review and modify the transaction details before creating a duplicate.
              </p>
            </div>
            <FormField
              control={incomeForm.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={incomeForm.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {filteredSubCategories.length > 0 && (
              <FormField
                control={incomeForm.control}
                name="subCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sub-category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredSubCategories.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={incomeForm.control}
              name="account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {combinedAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={incomeForm.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={incomeForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDuplicatePreviewOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Duplicate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      );
    } else if (selectedTransaction.type === 'Investment') {
      return (
        <Form {...investmentForm}>
          <form onSubmit={investmentForm.handleSubmit(handleSaveDuplicate)} className="space-y-4">
            <div className="bg-muted p-4 rounded-md mb-4">
              <h4 className="text-sm font-semibold mb-2">Preview & Edit Before Duplicating</h4>
              <p className="text-sm text-muted-foreground">
                Review and modify the transaction details before creating a duplicate.
              </p>
            </div>
            <FormField
              control={investmentForm.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={investmentForm.control}
              name="investmentAccount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Investment Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select investment account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {investmentAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={investmentForm.control}
              name="account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bankAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={investmentForm.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={investmentForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDuplicatePreviewOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Duplicate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>All Transactions</DialogTitle>
            <DialogDescription>
              View, edit, delete, or duplicate your transactions.
            </DialogDescription>
            <div className="flex gap-4 mt-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Month</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jan">January</SelectItem>
                    <SelectItem value="feb">February</SelectItem>
                    <SelectItem value="mar">March</SelectItem>
                    <SelectItem value="apr">April</SelectItem>
                    <SelectItem value="may">May</SelectItem>
                    <SelectItem value="jun">June</SelectItem>
                    <SelectItem value="jul">July</SelectItem>
                    <SelectItem value="aug">August</SelectItem>
                    <SelectItem value="sep">September</SelectItem>
                    <SelectItem value="oct">October</SelectItem>
                    <SelectItem value="nov">November</SelectItem>
                    <SelectItem value="dec">December</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Year</label>
                <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Type</label>
                <Select value={typeFilter} onValueChange={(val) => setTypeFilter(val as typeof typeFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Types</SelectItem>
                    <SelectItem value="Income">Income</SelectItem>
                    <SelectItem value="Expense">Expense</SelectItem>
                    <SelectItem value="Investment">Investment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-muted-foreground">No transactions found for this month.</p>
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions
                      .filter(tx => typeFilter === 'All' || tx.type === typeFilter)
                      .map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap">
                          {transaction.date || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={getTypeBadgeVariant(transaction.type)}
                            className={transaction.type === 'Income' ? 'bg-green-600 text-white hover:bg-green-600/80' : ''}
                          >
                            {transaction.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {transaction.description}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{transaction.category}</span>
                            {transaction.subCategory && (
                              <span className="text-xs text-muted-foreground">
                                {transaction.subCategory}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {transaction.type === 'Investment' ? (
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground">From:</span>
                              <span className="font-medium">{transaction.accountName || 'N/A'}</span>
                              <span className="text-xs text-muted-foreground mt-1">To:</span>
                              <span className="font-medium">{transaction.investmentAccountName || 'N/A'}</span>
                            </div>
                          ) : (
                            <span>{transaction.accountName || 'N/A'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{transaction.amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(transaction)}
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDuplicate(transaction)}
                              title="Duplicate"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(transaction)}
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Make changes to this {selectedTransaction?.type.toLowerCase()} transaction.
            </DialogDescription>
          </DialogHeader>
          {renderEditForm()}
        </DialogContent>
      </Dialog>

      {/* Duplicate Preview Dialog */}
      <Dialog open={isDuplicatePreviewOpen} onOpenChange={setIsDuplicatePreviewOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Duplicate Transaction</DialogTitle>
            <DialogDescription>
              Preview and modify this {selectedTransaction?.type.toLowerCase()} before creating a duplicate.
            </DialogDescription>
          </DialogHeader>
          {renderDuplicateForm()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the transaction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
