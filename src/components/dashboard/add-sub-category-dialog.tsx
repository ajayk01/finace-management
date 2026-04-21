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
import { useToast } from '@/hooks/use-toast';
import type { Category } from './add-expense-dialog';

const addSubCategorySchema = z.object({
  categoryId: z.string().min(1, 'Please select a category.'),
  subCategoryName: z.string().min(1, 'Sub-category name is required.'),
  budget: z.coerce.number().min(0, 'Budget must be non-negative.').default(0),
});

type AddSubCategoryFormValues = z.infer<typeof addSubCategorySchema>;

interface AddSubCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseCategories: Category[];
  incomeCategories: Category[];
  onSubCategoryAdded?: () => void;
}

export function AddSubCategoryDialog({
  open,
  onOpenChange,
  expenseCategories,
  incomeCategories,
  onSubCategoryAdded,
}: AddSubCategoryDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [categoryTypeFilter, setCategoryTypeFilter] = useState<'all' | 'expense' | 'income'>('all');

  const form = useForm<AddSubCategoryFormValues>({
    resolver: zodResolver(addSubCategorySchema),
    defaultValues: {
      categoryId: '',
      subCategoryName: '',
      budget: 0,
    },
  });

  const filteredCategories = (() => {
    if (categoryTypeFilter === 'expense') return expenseCategories;
    if (categoryTypeFilter === 'income') return incomeCategories;
    return [...expenseCategories, ...incomeCategories];
  })();

  const handleSubmit = async (values: AddSubCategoryFormValues) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/categories/subcategory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: parseInt(values.categoryId),
          subCategoryName: values.subCategoryName,
          budget: values.budget,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add sub-category');
      }

      toast({
        title: 'Sub-Category Added',
        description: `Sub-category "${values.subCategoryName}" has been successfully added.`,
      });

      form.reset();
      setCategoryTypeFilter('all');
      onOpenChange(false);
      onSubCategoryAdded?.();
    } catch (error) {
      console.error('Error adding sub-category:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add sub-category.';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
    setCategoryTypeFilter('all');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Sub-Category</DialogTitle>
          <DialogDescription>
            Create a new sub-category under an existing category.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Filter by Type</label>
              <Select value={categoryTypeFilter} onValueChange={(val) => {
                setCategoryTypeFilter(val as 'all' | 'expense' | 'income');
                form.setValue('categoryId', '');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="expense">Expense Categories</SelectItem>
                  <SelectItem value="income">Income Categories</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredCategories.map(cat => (
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
              name="subCategoryName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sub-Category Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Groceries, Petrol, Bonus" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget (Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0.00" min="0" {...field} />
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
                {isLoading ? 'Adding...' : 'Add Sub-Category'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
