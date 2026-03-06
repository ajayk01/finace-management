"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Transaction } from '@/app/page';

interface CreditCard {
  id: string;
  name: string;
  usedAmount: number;
  totalLimit: number;
}

interface BankAccount {
  id: string;
  name: string;
  balance: number;
}

interface PayCCBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCards: CreditCard[];
  bankAccounts: BankAccount[];
  onPaymentMade: (payment: Transaction, fromBankId: string, toCreditCardId: string, amount: number) => void;
  defaultCreditCardId?: string;
}

const paymentSchema = z.object({
  creditCardId: z.string().min(1, "Please select a credit card"),
  amount: z.string().min(1, "Amount is required").refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, "Amount must be a positive number"),
  bankAccountId: z.string().min(1, "Please select a bank account"),
  date: z.date({ required_error: "Please select a date" }),
  time: z.string().min(1, "Please enter a time"),
  description: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

export function PayCCBillDialog({
  open,
  onOpenChange,
  creditCards,
  bankAccounts,
  onPaymentMade,
  defaultCreditCardId,
}: PayCCBillDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      creditCardId: "",
      amount: "",
      bankAccountId: "",
      date: new Date(),
      time: format(new Date(), "HH:mm"),
      description: "",
    },
  });

  // Pre-select credit card when defaultCreditCardId is provided
  useEffect(() => {
    if (open && defaultCreditCardId) {
      form.setValue("creditCardId", defaultCreditCardId);
      handleCreditCardChange(defaultCreditCardId);
    }
  }, [open, defaultCreditCardId]);

  const selectedCreditCardId = form.watch("creditCardId");
  const selectedCreditCard = creditCards.find(card => card.id === selectedCreditCardId);

  // Update amount when credit card changes
  const handleCreditCardChange = (creditCardId: string) => {
    const card = creditCards.find(c => c.id === creditCardId);
    if (card) {
      form.setValue("amount", card.usedAmount.toString());
      form.setValue("description", `Credit card payment for ${card.name}`);
    }
  };

  const onSubmit = async (data: PaymentFormData) => {
    setIsSubmitting(true);
    try {
      const amount = parseFloat(data.amount);
      const creditCard = creditCards.find(c => c.id === data.creditCardId);
      const bankAccount = bankAccounts.find(b => b.id === data.bankAccountId);

      if (!creditCard || !bankAccount) {
        throw new Error("Invalid credit card or bank account selected");
      }

      if (amount > bankAccount.balance) {
        throw new Error("Insufficient bank balance");
      }

      if (amount > creditCard.usedAmount) {
        throw new Error("Payment amount cannot exceed credit card used amount");
      }

      const response = await fetch('/api/pay-cc-bill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creditCardId: data.creditCardId,
          bankAccountId: data.bankAccountId,
          amount: amount,
          date: (() => {
            const [hours, minutes] = data.time.split(':').map(Number);
            const d = new Date(data.date);
            d.setHours(hours, minutes, 0, 0);
            return d.getTime();
          })(),
          description: data.description || `Credit card payment for ${creditCard.name}`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process payment');
      }

      const result = await response.json();

      // Create transaction object for parent component
      const dateWithTime = new Date(data.date);
      const [h, m] = data.time.split(':').map(Number);
      dateWithTime.setHours(h, m, 0, 0);
      const transaction: Transaction = {
        id: result.transactionId || Date.now().toString(),
        date: dateWithTime.toISOString(),
        description: data.description || `Credit card payment for ${creditCard.name}`,
        amount: amount,
        type: 'Transfer',
        category: 'Credit Card Payment',
        subCategory: creditCard.name,
      };

      onPaymentMade(transaction, data.bankAccountId, data.creditCardId, amount);

      toast({
        title: "Payment Successful",
        description: `₹${amount.toLocaleString('en-IN')} transferred from ${bankAccount.name} to ${creditCard.name}`,
      });

      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        variant: "destructive",
        title: "Payment Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay Credit Card Bill</DialogTitle>
          <DialogDescription>
            Transfer money from your bank account to pay off credit card bill.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="creditCardId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Credit Card</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      handleCreditCardChange(value);
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select credit card" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {creditCards.map((card) => (
                        <SelectItem key={card.id} value={card.id}>
                          {card.name} (Used: ₹{card.usedAmount.toLocaleString('en-IN')})
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
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Enter amount"
                      {...field}
                    />
                  </FormControl>
                  {selectedCreditCard && (
                    <p className="text-sm text-muted-foreground">
                      Used amount: ₹{selectedCreditCard.usedAmount.toLocaleString('en-IN')}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bankAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} (Balance: ₹{account.balance.toLocaleString('en-IN')})
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
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
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
                <FormItem>
                  <FormLabel>Time</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Payment description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Processing..." : "Pay Bill"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
