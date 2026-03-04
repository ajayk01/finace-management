
"use client";

import { useState } from 'react';
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

const investmentSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0.'),
  date: z.date({ required_error: 'A date is required.' }),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format.'),
  description: z.string().min(1, 'Description is required.'),
  accountId: z.string().min(1, 'Please select a source account.'),
  investmentAccountId: z.string().min(1, 'Please select an investment category.'),
});

export interface InvestmentCategory {
  id: string;
  name: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'Bank'; // Investments are typically from bank accounts
}

interface AddInvestmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investmentCategories: InvestmentCategory[];
  accounts: Account[];
  onInvestmentAdded: (newInvestment: Transaction, fromAccountId: string) => void;
  editTransactionId?: string;
  initialValues?: Partial<InvestmentFormValues>;
}

export type InvestmentFormValues = z.infer<typeof investmentSchema>;

export function AddInvestmentDialog({ open, onOpenChange, investmentCategories, accounts, onInvestmentAdded, editTransactionId, initialValues }: AddInvestmentDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const isEditMode = !!editTransactionId;

  const form = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentSchema),
    defaultValues: {
      amount: 0,
      description: '',
      accountId: '',
      investmentAccountId: '',
      date: new Date(),
      time: format(new Date(), 'HH:mm'),
      ...initialValues,
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      form.reset();
    }, 200);
  };

  const onSubmit = async (values: InvestmentFormValues) => {
    setIsLoading(true);

    const payload = {
      amount: values.amount,
      date: format(values.date, 'yyyy-MM-dd') + 'T' + values.time,
      description: values.description,
      accountId: values.accountId,
      investmentAccountId: values.investmentAccountId,
    };

    try {
      const response = await fetch(isEditMode ? '/api/all-transactions' : '/api/add-investment', {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEditMode ? { id: editTransactionId, ...payload } : payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Failed to ${isEditMode ? 'update' : 'add'} investment.`);
      }

      toast({
        title: isEditMode ? 'Investment Updated' : 'Investment Added',
        description: `The investment "${values.description}" has been successfully ${isEditMode ? 'updated' : 'recorded'}.`,
      });

      const categoryName = investmentCategories.find(c => c.id === values.investmentAccountId)?.name || 'N/A';
      
      const newTransaction: Transaction = {
        id: `new-investment-${Date.now()}`,
        date: values.date.toISOString(),
        description: values.description,
        amount: values.amount,
        type: 'Investment',
        category: categoryName,
        subCategory: '',
      };

      onInvestmentAdded(newTransaction, values.accountId);
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
          <DialogTitle>{isEditMode ? 'Edit Investment' : 'Add New Investment'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Update the details of your investment.' : 'Fill in the details below to record a new investment.'}
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
              <div className="grid grid-cols-2 gap-4">
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
                  name="time"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Monthly SIP in Index Fund" {...field} />
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
                      <FormLabel>Paid From (Bank Account)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                          <SelectTrigger>
                              <SelectValue placeholder="Select a bank account" />
                          </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                          {accounts.map(acc => (
                              <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                          ))}
                          </SelectContent>
                      </Select>
                      <FormMessage />
                      </FormItem>
                  )}
              />
              <FormField
                  control={form.control}
                  name="investmentAccountId"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Investment Category / Account</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                          <SelectTrigger>
                              <SelectValue placeholder="Select an investment account" />
                          </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                          {investmentCategories.map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
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
                {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Investment' : 'Add Investment')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}