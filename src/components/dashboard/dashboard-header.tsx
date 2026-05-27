
"use client"
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { PlusCircle, ChevronDown, Bell } from "lucide-react";
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
import { AddCategoryDialog } from './add-category-dialog';
import { AddSubCategoryDialog } from './add-sub-category-dialog';
import type { Category, SubCategory, Account } from './add-expense-dialog';
import type { SplitwiseGroup } from './add-expense-dialog';
import type { InvestmentCategory } from './add-investment-dialog';
import type { Transaction } from '@/app/page';

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
  onCategoryAdded?: () => void;
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
    onCategoryAdded,
}: DashboardHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [isAddInvestmentOpen, setIsAddInvestmentOpen] = useState(false);
  const [isPayCCBillOpen, setIsPayCCBillOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddTransferOpen, setIsAddTransferOpen] = useState(false);
  const [isAddCapOpen, setIsAddCapOpen] = useState(false);
  const [isUnauditedExpenseOpen, setIsUnauditedExpenseOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isAddSubCategoryOpen, setIsAddSubCategoryOpen] = useState(false);
  const [isSendNotificationOpen, setIsSendNotificationOpen] = useState(false);

  const [selectedCreditCardForCap, setSelectedCreditCardForCap] = useState<string>('');
  const [splitwiseGroups, setSplitwiseGroups] = useState<SplitwiseGroup[]>([]);

  useEffect(() => {
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
    fetchSplitwiseGroups();
  }, [toast]);

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
                    <DropdownMenuItem onClick={() => setIsAddCategoryOpen(true)}>Add Category</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsAddSubCategoryOpen(true)}>Add Sub-Category</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsAddCapOpen(true)}>Add Cap</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/splitwise')}>Splitwise</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/transactions')}>Get All Transactions</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsUnauditedExpenseOpen(true)}>Unaudited Expense</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsPayCCBillOpen(true)}>Pay CC bill</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/mf-investments')}>Check MF Investment</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsSendNotificationOpen(true)}>
                      <Bell className="mr-2 h-4 w-4" /> Send Notification
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
      <AddCategoryDialog
        open={isAddCategoryOpen}
        onOpenChange={setIsAddCategoryOpen}
        onCategoryAdded={onCategoryAdded}
      />
      <AddSubCategoryDialog
        open={isAddSubCategoryOpen}
        onOpenChange={setIsAddSubCategoryOpen}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        onSubCategoryAdded={onCategoryAdded}
      />
      <AddCapHeaderDialog
        open={isAddCapOpen}
        onOpenChange={setIsAddCapOpen}
        creditCards={creditCards}
      />
      <SendNotificationDialog
        open={isSendNotificationOpen}
        onOpenChange={setIsSendNotificationOpen}
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
    rewardPerAmount: z.coerce.number().min(1, 'Reward per amount must be at least 1.'),
  });

  const capForm = useForm<z.infer<typeof capSchema>>({
    resolver: zodResolver(capSchema),
    defaultValues: {
      creditCardId: '',
      capName: '',
      capTotalAmount: '' as any,
      capPercentage: '' as any,
      rewardPerAmount: 100,
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
            <FormField
              control={capForm.control}
              name="rewardPerAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reward Per Amount</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="100" min="1" {...field} />
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

// Send Notification Dialog
function SendNotificationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState<{ ID: number; DEVICE_NAME: string }[]>([]);
  const [tokenMode, setTokenMode] = useState<'device' | 'manual'>('device');

  useEffect(() => {
    if (open) {
      fetch('/api/fcm-tokens')
        .then(res => res.json())
        .then(data => setDevices(data.devices || []))
        .catch(() => setDevices([]));
    }
  }, [open]);

  const notificationSchema = z.object({
    deviceId: z.string().optional(),
    token: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
  }).refine(
    (data) => (tokenMode === 'device' ? !!data.deviceId : !!data.token),
    { message: tokenMode === 'device' ? 'Please select a device.' : 'FCM token is required.', path: [tokenMode === 'device' ? 'deviceId' : 'token'] }
  );

  const form = useForm<z.infer<typeof notificationSchema>>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      deviceId: '',
      token: '',
      title: '',
      body: '',
    },
  });

  const handleSubmit = async (values: z.infer<typeof notificationSchema>) => {
    setIsLoading(true);
    try {
      const payload: Record<string, string | undefined> = {
        title: values.title || undefined,
        body: values.body || undefined,
      };

      if (tokenMode === 'device') {
        payload.deviceId = values.deviceId;
      } else {
        payload.token = values.token;
      }

      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send notification');
      }

      toast({
        title: 'Notification Sent',
        description: `Message ID: ${data.messageId}`,
      });

      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error('Error sending notification:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send notification.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
    setTokenMode('device');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Push Notification</DialogTitle>
          <DialogDescription>
            Send a remote notification to an Android device via FCM.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="flex gap-2 mb-2">
              <Button type="button" size="sm" variant={tokenMode === 'device' ? 'default' : 'outline'} onClick={() => setTokenMode('device')}>
                Saved Device
              </Button>
              <Button type="button" size="sm" variant={tokenMode === 'manual' ? 'default' : 'outline'} onClick={() => setTokenMode('manual')}>
                Manual Token
              </Button>
            </div>

            {tokenMode === 'device' ? (
              <FormField
                control={form.control}
                name="deviceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Device</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={devices.length ? 'Select a device' : 'No devices registered'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {devices.map(d => (
                          <SelectItem key={d.ID} value={String(d.ID)}>{d.DEVICE_NAME}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>FCM Device Token</FormLabel>
                    <FormControl>
                      <Input placeholder="Paste device FCM token" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Notification title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Notification message" {...field} />
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
                {isLoading ? 'Sending...' : 'Send Notification'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}