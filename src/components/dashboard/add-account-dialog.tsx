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
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const accountSchema = z.object({
  accountName: z.string().min(1, 'Account name is required.'),
  accountType: z.enum(['Bank', 'Credit Card', 'Investment'], {
    required_error: 'Please select an account type.',
  }),
  totalLimit: z.coerce.number().min(0, 'Total limit must be a positive number.').optional(),
  initialBalance: z.coerce.number().optional().default(0),
}).refine(
  (data) => {
    // If account type is Credit Card, total limit is required
    if (data.accountType === 'Credit Card') {
      return data.totalLimit !== undefined && data.totalLimit > 0;
    }
    return true;
  },
  {
    message: 'Total limit is required for credit cards.',
    path: ['totalLimit'],
  }
);

type AccountFormValues = z.infer<typeof accountSchema>;

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountAdded?: () => void;
}

export function AddAccountDialog({ open, onOpenChange, onAccountAdded }: AddAccountDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      accountName: '',
      accountType: undefined,
      totalLimit: undefined,
      initialBalance: 0,
    },
  });

  const accountType = form.watch('accountType');

  async function onSubmit(data: AccountFormValues) {
    setIsLoading(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountName: data.accountName,
          accountType: data.accountType,
          initialBalance: data.initialBalance || 0,
          totalLimit: data.accountType === 'Credit Card' ? data.totalLimit : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add account');
      }

      toast({
        title: "Account Added",
        description: `${data.accountName} has been successfully added.`,
      });

      form.reset();
      onOpenChange(false);
      
      if (onAccountAdded) {
        onAccountAdded();
      }
    } catch (error) {
      console.error('Error adding account:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add account. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Account</DialogTitle>
          <DialogDescription>
            Add a new bank account, credit card, or investment account to track your finances.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="accountName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., HDFC Savings, ICICI Credit Card" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Bank">Bank Account</SelectItem>
                      <SelectItem value="Credit Card">Credit Card</SelectItem>
                      <SelectItem value="Investment">Investment Account</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="initialBalance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {accountType === 'Credit Card' ? 'Current Used Amount (Optional)' : 'Initial Balance (Optional)'}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      placeholder={accountType === 'Credit Card' ? "0" : "0"}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {accountType === 'Credit Card' && (
              <FormField
                control={form.control}
                name="totalLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Limit *</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="e.g., 100000"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
                Add Account
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
