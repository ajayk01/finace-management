
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
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/app/page';

const incomeSchemaBase = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0.'),
  date: z.date({ required_error: 'A date is required.' }),
  description: z.string().min(1, 'Description is required.'),
  accountId: z.string().min(1, 'Please select an account.'),
  categoryId: z.string().min(1, 'Category is required.'),
  subCategoryId: z.string().optional(),
});

interface AddIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  subCategories: SubCategory[];
  accounts: Account[];
  onIncomeAdded: (newIncome: Transaction, accountId: string, accountType: 'Bank' | 'Credit Card') => void;
  editTransactionId?: string; // Optional: ID of transaction being edited
  initialValues?: Partial<IncomeFormValues>; // Optional: Initial form values for editing
}

export interface Category {
  id: string;
  name: string;
}

export interface SubCategory {
  id: string;
  name: string;
  categoryId: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'Bank' | 'Credit Card';
}

export type IncomeFormValues = z.infer<typeof incomeSchemaBase>;

export function AddIncomeDialog({ 
  open, 
  onOpenChange, 
  categories, 
  subCategories, 
  accounts, 
  onIncomeAdded,
  editTransactionId,
  initialValues 
}: AddIncomeDialogProps) {
  const { toast } = useToast();
  const [filteredSubCategories, setFilteredSubCategories] = useState<SubCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isEditMode = !!editTransactionId;

  const incomeSchema = incomeSchemaBase.refine(
    (data) => {
      const relatedSubCategories = subCategories.filter(sc => sc.categoryId === data.categoryId);
      if (relatedSubCategories.length > 0) {
        return !!data.subCategoryId && data.subCategoryId.length > 0;
      }
      return true;
    },
    {
      message: 'Sub-category is required.',
      path: ['subCategoryId'],
    }
  );

  const form = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: initialValues || {
      amount: 0,
      description: '',
      accountId: '',
      categoryId: '',
      subCategoryId: '',
      date: new Date(),
    },
  });

  const selectedCategoryId = form.watch('categoryId');

  useEffect(() => {
    if (selectedCategoryId) {
      const relatedSubCategories = subCategories.filter((sc) => sc.categoryId === selectedCategoryId);
      setFilteredSubCategories(relatedSubCategories);
      
      // Only clear subCategoryId if current value doesn't belong to the selected category
      const currentSubCategoryId = form.getValues('subCategoryId');
      const isValidSubCategory = relatedSubCategories.some(sc => sc.id === currentSubCategoryId);
      
      if (currentSubCategoryId && !isValidSubCategory) {
        form.setValue('subCategoryId', '');
      }
      
      if (form.formState.isSubmitted) {
        form.trigger('subCategoryId');
      }
    } else {
      setFilteredSubCategories([]);
    }
  }, [selectedCategoryId, subCategories, form]);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      form.reset();
    }, 200);
  };

  const onSubmit = async (values: IncomeFormValues) => {
    setIsLoading(true);
    
    const selectedAccount = accounts.find(acc => acc.id === values.accountId);
    if (!selectedAccount) {
        toast({ variant: "destructive", title: "Error", description: "Selected account not found." });
        setIsLoading(false);
        return;
    }

    const payload: any = {
        amount: values.amount,
        date: format(values.date, 'yyyy-MM-dd'),
        description: values.description,
        account: {
            id: values.accountId,
            type: selectedAccount.type,
        },
        categoryId: values.categoryId,
        subCategoryId: values.subCategoryId,
    };
    
    // Add transaction ID if editing
    if (isEditMode && editTransactionId) {
        payload.id = editTransactionId;
    }

    try {
        const response = await fetch('/api/add-income', {
            method: isEditMode ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Failed to ${isEditMode ? 'update' : 'add'} income.`);
        }

        toast({
            title: isEditMode ? 'Income Updated' : 'Income Added',
            description: `The income "${values.description}" has been successfully ${isEditMode ? 'updated' : 'recorded'}.`,
        });

        const categoryName = categories.find(c => c.id === values.categoryId)?.name || 'N/A';
        const subCategoryName = subCategories.find(sc => sc.id === values.subCategoryId)?.name || '';

        const newTransaction: Transaction = {
          id: `new-income-${Date.now()}`,
          date: values.date.toISOString(),
          description: values.description,
          amount: values.amount,
          type: 'Income',
          category: categoryName,
          subCategory: subCategoryName,
        };

        onIncomeAdded(newTransaction, values.accountId, selectedAccount.type);
        handleClose();

    } catch (error) {
        toast({
            variant: "destructive",
            title: 'Submission Failed',
            description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Income' : 'Add New Income'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details of your income transaction.' : 'Fill in the details below to add a new income transaction.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            type="button"
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
                      <PopoverContent className="w-auto p-0 z-[9999]" align="start">
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
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Monthly Salary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Paid Into</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                          <SelectTrigger>
                              <SelectValue placeholder="Select a bank or credit card" />
                          </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                          {accounts.map(acc => (
                              <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>
                          ))}
                          </SelectContent>
                      </Select>
                      <FormMessage />
                      </FormItem>
                  )}
              />
              <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Income Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                          <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                          {categories.map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                          ))}
                          </SelectContent>
                      </Select>
                      <FormMessage />
                      </FormItem>
                  )}
              />
              <FormField
                  control={form.control}
                  name="subCategoryId"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Income Sub-category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCategoryId || filteredSubCategories.length === 0}>
                          <FormControl>
                          <SelectTrigger>
                              <SelectValue placeholder={filteredSubCategories.length === 0 ? "No sub-categories available" : "Select a sub-category" }/>
                          </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                          {filteredSubCategories.map(subCat => (
                              <SelectItem key={subCat.id} value={subCat.id}>{subCat.name}</SelectItem>
                          ))}
                          </SelectContent>
                      </Select>
                      <FormMessage />
                      </FormItem>
                  )}
              />
            </div>
            
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Income' : 'Add Income')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}