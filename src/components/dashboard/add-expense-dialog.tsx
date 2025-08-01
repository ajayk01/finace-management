
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

const expenseSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0.'),
  date: z.date({ required_error: 'A date is required.' }),
  description: z.string().min(1, 'Description is required.'),
  categoryId: z.string().min(1, 'Category is required.'),
  subCategoryId: z.string().min(1, 'Sub-category is required.'),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

export interface Category {
  id: string;
  name: string;
}

export interface SubCategory {
  id: string;
  name: string;
  categoryId: string;
}

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  subCategories: SubCategory[];
}

export function AddExpenseDialog({ open, onOpenChange, categories, subCategories }: AddExpenseDialogProps) {
  const { toast } = useToast();
  const [filteredSubCategories, setFilteredSubCategories] = useState<SubCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: 0,
      description: '',
      categoryId: '',
      subCategoryId: '',
      date: new Date(),
    },
  });

  const selectedCategoryId = form.watch('categoryId');

  useEffect(() => {
    if (selectedCategoryId) {
      setFilteredSubCategories(
        subCategories.filter((sc) => sc.categoryId === selectedCategoryId)
      );
      form.setValue('subCategoryId', '');
    } else {
      setFilteredSubCategories([]);
    }
  }, [selectedCategoryId, subCategories, form]);

  const onSubmit = async (values: ExpenseFormValues) => {
    setIsLoading(true);
    // Here you would typically make an API call to a new endpoint to add the expense
    console.log('Submitting expense:', values);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
    setIsLoading(false);
    toast({
      title: 'Expense Added',
      description: 'The new expense has been recorded.',
    });
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Expense</DialogTitle>
          <DialogDescription>
            Fill in the details below to add a new expense transaction.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Groceries from store" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Expense Category</FormLabel>
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
                    <FormLabel>Expense Sub-category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCategoryId}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a sub-category" />
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
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Adding...' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
