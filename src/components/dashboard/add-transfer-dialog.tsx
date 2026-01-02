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
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/app/page';

const transferSchema = z.object({
  date: z.date({ required_error: 'A date is required.' }),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0.'),
  fromAccountId: z.string().min(1, 'Please select a source account.'),
  toAccountId: z.string().min(1, 'Please select a destination account.'),
  description: z.string().min(1, 'Description is required.'),
}).refine(
  (data) => data.fromAccountId !== data.toAccountId,
  {
    message: 'Source and destination accounts must be different.',
    path: ['toAccountId'],
  }
);

type TransferFormValues = z.infer<typeof transferSchema>;

interface AddTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccounts: BankAccount[];
  onTransferAdded?: (newTransfer: Transaction, fromAccountId: string, toAccountId: string) => void;
}

export interface BankAccount {
  id: string;
  name: string;
  type: 'Bank';
  balance?: number;
}

export function AddTransferDialog({ open, onOpenChange, bankAccounts, onTransferAdded }: AddTransferDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      amount: 0,
      description: '',
      fromAccountId: '',
      toAccountId: '',
      date: new Date(),
    },
  });

  const fromAccountId = form.watch('fromAccountId');
  const toAccountId = form.watch('toAccountId');

  async function onSubmit(data: TransferFormValues) {
    setIsLoading(true);
    try {
      const response = await fetch('/api/add-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: data.amount,
          date: format(data.date, 'yyyy-MM-dd'),
          description: data.description,
          fromAccountId: parseInt(data.fromAccountId),
          toAccountId: parseInt(data.toAccountId),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add transfer');
      }

      const newTransfer: Transaction = {
        id: result.transactionId.toString(),
        amount: data.amount,
        date: format(data.date, 'yyyy-MM-dd'),
        description: data.description,
        category: 'Transfer',
        subCategory: '',
        type: 'Transfer' as const,
      };

      toast({
        title: "Transfer Added",
        description: `₹${data.amount.toLocaleString('en-IN')} transferred successfully.`,
      });

      form.reset({
        amount: 0,
        description: '',
        fromAccountId: '',
        toAccountId: '',
        date: new Date(),
      });
      
      onOpenChange(false);

      if (onTransferAdded) {
        onTransferAdded(newTransfer, data.fromAccountId, data.toAccountId);
      }
    } catch (error) {
      console.error('Error adding transfer:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add transfer. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Get available destination accounts (exclude selected from account)
  const availableToAccounts = fromAccountId 
    ? bankAccounts.filter(acc => acc.id !== fromAccountId)
    : bankAccounts;

  // Get available source accounts (exclude selected to account)
  const availableFromAccounts = toAccountId
    ? bankAccounts.filter(acc => acc.id !== toAccountId)
    : bankAccounts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Transfer</DialogTitle>
          <DialogDescription>
            Transfer money between your bank accounts.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      placeholder="e.g., 5000" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fromAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From Bank Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select source account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableFromAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} {acc.balance !== undefined && `(₹${acc.balance.toLocaleString('en-IN')})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="toAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To Bank Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select destination account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableToAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} {acc.balance !== undefined && `(₹${acc.balance.toLocaleString('en-IN')})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <Input placeholder="e.g., Moving funds for investment" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset();
                  onOpenChange(false);
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Transfer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
