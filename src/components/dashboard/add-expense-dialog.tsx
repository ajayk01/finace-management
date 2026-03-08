
"use client";

import { useState, useEffect, useCallback } from 'react';
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
import { CalendarIcon, Users, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Transaction } from '@/app/page';


const expenseSchemaBase = z.object({
  amount: z.coerce.number().refine((val) => val !== 0, { message: 'Amount cannot be zero.' }),
  charges: z.coerce.number().min(0, 'Charges cannot be negative.').default(0),
  date: z.date({ required_error: 'A date is required.' }),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format.'),
  description: z.string().min(1, 'Description is required.'),
  accountId: z.string().min(1, 'Please select an account.'),
  categoryId: z.string().min(1, 'Category is required.'),
  subCategoryId: z.string().optional(), // Make optional initially
  capId: z.string().optional(), // Credit card cap ID
  includeSplitwise: z.boolean().default(false),
  splitwiseGroupId: z.string().optional(),
  splitwiseUserIds: z.array(z.string()).optional(),
  splitType: z.enum(['equal', 'custom']).default('equal'),
  customAmounts: z.record(z.string(), z.coerce.number()).optional(),
});


interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  subCategories: SubCategory[];
  accounts: Account[];
  onExpenseAdded: (newExpense: Transaction, accountId: string, accountType: 'Bank' | 'Credit Card') => void;
  editTransactionId?: string; // Optional: ID of transaction being edited
  initialValues?: Partial<ExpenseFormValues>; // Optional: Initial form values for editing
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
  balance?: number; // For bank accounts
  usedAmount?: number; // For credit cards
  totalLimit?: number; // For credit cards
}

export interface SplitwiseUser {
    id: string;
    name: string;
}

export interface SplitwiseGroup {
    id: string;
    name: string;
    members: SplitwiseUser[];
}

export interface CreditCardCap {
    id: string;
    creditCardId: string;
    capName: string;
    capTotalAmount: number;
    capPercentage: number;
    capCurrentAmount: number;
    remainingAmount: number;
}

export type ExpenseFormValues = z.infer<typeof expenseSchemaBase>;


export function AddExpenseDialog({ 
  open, 
  onOpenChange, 
  categories, 
  subCategories, 
  accounts, 
  onExpenseAdded,
  editTransactionId,
  initialValues 
}: AddExpenseDialogProps) {
  const { toast } = useToast();
  const [filteredSubCategories, setFilteredSubCategories] = useState<SubCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const isEditMode = !!editTransactionId;
  
  // State for Splitwise
  const [splitwiseGroups, setSplitwiseGroups] = useState<SplitwiseGroup[]>([]);
  const [isSplitwiseLoading, setIsSplitwiseLoading] = useState(false);
  const [splitwiseError, setSplitwiseError] = useState<string | null>(null);
  const [splitwiseUsers, setSplitwiseUsers] = useState<SplitwiseUser[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  
  // State for Credit Card Caps
  const [creditCardCaps, setCreditCardCaps] = useState<CreditCardCap[]>([]);
  const [isCapsLoading, setIsCapsLoading] = useState(false);

  // Dynamically create the refined schema inside the component
  const expenseSchema = expenseSchemaBase.refine(
    (data) => {
      const relatedSubCategories = subCategories.filter(sc => sc.categoryId === data.categoryId);
      // If there are sub-categories for the selected category, then subCategoryId must be selected.
      if (relatedSubCategories.length > 0) {
        return !!data.subCategoryId && data.subCategoryId.length > 0;
      }
      // If there are no sub-categories, this validation passes.
      return true;
    },
    {
      message: 'Sub-category is required.',
      path: ['subCategoryId'],
    }
  ).refine(
    (data) => {
      // Validate custom amounts if split type is custom
      if (data.includeSplitwise && data.splitType === 'custom' && data.splitwiseUserIds && data.customAmounts) {
        const totalCustomAmount = Object.values(data.customAmounts).reduce((sum, amount) => sum + (isNaN(amount) ? 0 : amount), 0);
        return Math.abs(totalCustomAmount - data.amount) < 0.01; // Allow for small floating point differences
      }
      return true;
    },
    {
      message: 'Custom amounts must total the expense amount.',
      path: ['customAmounts'],
    }
  );

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: 0,
      charges: 0,
      description: '',
      accountId: '',
      categoryId: '',
      subCategoryId: '',
      capId: undefined,
      date: new Date(),
      time: format(new Date(), 'HH:mm'),
      includeSplitwise: false,
      splitwiseGroupId: '',
      splitwiseUserIds: [],
      splitType: 'equal',
      customAmounts: {},
      ...initialValues,
    },
  });

  const selectedCategoryId = form.watch('categoryId');
  const selectedAccountId = form.watch('accountId');
  const selectedSplitwiseGroupId = form.watch('splitwiseGroupId');
  const selectedSplitwiseUsers = form.watch('splitwiseUserIds') || [];
  const splitType = form.watch('splitType');
  const totalAmount = form.watch('amount');

  // Load Splitwise data if editing expense with Splitwise
  useEffect(() => {
    if (open && isEditMode && initialValues?.includeSplitwise && initialValues.splitwiseGroupId) {
      // Fetch Splitwise groups to populate the form
      const fetchSplitwiseData = async () => {
        setIsSplitwiseLoading(true);
        setSplitwiseError(null);
        try {
          const res = await fetch('/api/splitwise');
          if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch Splitwise data');
          const data = await res.json();
          const groups = data.groups || [];
          setSplitwiseGroups(groups);
          
          // Find and set users for the initial group
          const initialGroup = groups.find((g: SplitwiseGroup) => g.id === initialValues.splitwiseGroupId);
          if (initialGroup) {
            setSplitwiseUsers(initialGroup.members || []);
          }
          
          // Set initial custom amounts if available
          if (initialValues.customAmounts) {
            setCustomAmounts(initialValues.customAmounts);
          }
        } catch (error) {
          setSplitwiseError(error instanceof Error ? error.message : "An unknown error occurred");
        } finally {
          setIsSplitwiseLoading(false);
        }
      };
      fetchSplitwiseData();
    }
  }, [open, isEditMode, initialValues]);

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
      
       // Re-validate when category changes
      if (form.formState.isSubmitted) {
        form.trigger('subCategoryId');
      }
    } else {
      setFilteredSubCategories([]);
    }
  }, [selectedCategoryId, subCategories, form]);

  // Fetch credit card caps when account changes
  useEffect(() => {
    const fetchCaps = async () => {
      if (!selectedAccountId) {
        setCreditCardCaps([]);
        form.setValue('capId', undefined);
        return;
      }

      const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);
      
      // Only fetch caps if the selected account is a credit card
      if (selectedAccount?.type !== 'Credit Card') {
        setCreditCardCaps([]);
        form.setValue('capId', undefined);
        return;
      }

      setIsCapsLoading(true);
      try {
        const response = await fetch(`/api/credit-card-caps?creditCardId=${selectedAccountId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch credit card caps');
        }
        const data = await response.json();
        setCreditCardCaps(data.caps || []);
      } catch (error) {
        console.error('Error fetching credit card caps:', error);
        setCreditCardCaps([]);
      } finally {
        setIsCapsLoading(false);
      }
    };

    fetchCaps();
  }, [selectedAccountId, accounts]);

  useEffect(() => {
    if (selectedSplitwiseGroupId) {
        const group = splitwiseGroups.find(g => g.id === selectedSplitwiseGroupId);
        setSplitwiseUsers(group?.members || []);
        
        // Only reset users if this is NOT initial load with edit data
        const hasInitialUsers = initialValues?.splitwiseUserIds && initialValues.splitwiseUserIds.length > 0;
        const isInitialGroupLoad = isEditMode && initialValues?.splitwiseGroupId === selectedSplitwiseGroupId && hasInitialUsers;
        
        if (!isInitialGroupLoad) {
          // User manually changed the group - reset selections
          form.setValue('splitwiseUserIds', []);
          setCustomAmounts({});
          form.setValue('customAmounts', {});
          form.setValue('splitType', 'equal');
        }
    } else {
        setSplitwiseUsers([]);
    }
  }, [selectedSplitwiseGroupId, splitwiseGroups, form, isEditMode, initialValues]);

  // Reset custom amounts when users change
  useEffect(() => {
    if (splitType === 'custom' && selectedSplitwiseUsers.length > 0 && totalAmount > 0) {
      const newCustomAmounts: Record<string, number> = {};
      // Calculate equal split with proper rounding for decimal amounts
      const totalCents = Math.round(totalAmount * 100);
      const baseCents = Math.floor(totalCents / selectedSplitwiseUsers.length);
      const remainderCents = totalCents - (baseCents * selectedSplitwiseUsers.length);
      
      selectedSplitwiseUsers.forEach((userId, index) => {
        // First 'remainderCents' users get 1 extra cent to account for rounding
        const userCents = baseCents + (index < remainderCents ? 1 : 0);
        newCustomAmounts[userId] = customAmounts[userId] || (userCents / 100);
      });
      setCustomAmounts(newCustomAmounts);
      form.setValue('customAmounts', newCustomAmounts);
    }
  }, [selectedSplitwiseUsers, splitType, totalAmount]);

  const handleClose = () => {
    onOpenChange(false);
    // Reset form and step on close
    setTimeout(() => {
      form.reset();
      setStep(1);
      setCustomAmounts({});
    }, 200);
  };

  const onSubmit = async (values: ExpenseFormValues) => {
    setIsLoading(true);
    
    const selectedAccount = accounts.find(acc => acc.id === values.accountId);
    if (!selectedAccount) {
        toast({ variant: "destructive", title: "Error", description: "Selected account not found." });
        setIsLoading(false);
        return;
    }

    const payload: any = {
        amount: values.amount,
        charges: values.charges || 0,
        date: format(values.date, 'yyyy-MM-dd') + 'T' + values.time,
        description: values.description,
        account: {
            id: values.accountId,
            type: selectedAccount.type,
        },
        categoryId: values.categoryId,
        subCategoryId: values.subCategoryId,
        includeSplitwise: values.includeSplitwise
    };
    
    // Only include capId if it's defined and not empty
    if (values.capId) {
        payload.capId = values.capId;
    }
    
    // Add transaction ID and account info for edit mode
    if (isEditMode && editTransactionId) {
        payload.id = editTransactionId;
        // Ensure account object is included for PUT requests
        payload.account = {
            id: values.accountId,
            type: selectedAccount.type,
        };
    }
    
    if (values.includeSplitwise) {
        payload.splitwiseGroupId = values.splitwiseGroupId;
        payload.splitwiseUserIds = values.splitwiseUserIds;
        payload.splitwiseGroupName = splitwiseGroups.find(g => g.id === values.splitwiseGroupId)?.name;
        payload.splitType = values.splitType;
        payload.customAmounts = values.customAmounts;
    }


    try {
        console.log(`${isEditMode ? 'Editing' : 'Adding'} expense with payload:`, payload);
        const response = await fetch('/api/add-expense', {
            method: isEditMode ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `Failed to ${isEditMode ? 'update' : 'add'} expense.`);
        }

        toast({
            title: isEditMode ? 'Expense Updated' : 'Expense Added',
            description: `The expense "${values.description}" has been successfully ${isEditMode ? 'updated' : 'recorded'}.`,
        });

        // Construct the new transaction object for client-side update
        const categoryName = categories.find(c => c.id === values.categoryId)?.name || 'N/A';
        const subCategoryName = subCategories.find(sc => sc.id === values.subCategoryId)?.name || '';

        const newTransaction: Transaction = {
          id: `new-${Date.now()}`, // Temporary unique ID for client-side rendering
          date: values.date.toISOString(),
          description: values.description,
          amount: values.amount,
          type: 'Expense',
          category: categoryName,
          subCategory: subCategoryName,
        };

        onExpenseAdded(newTransaction, values.accountId, selectedAccount.type);
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

  // Helper functions for custom amounts
  const updateCustomAmount = (userId: string, amount: number) => {
    const validAmount = isNaN(amount) ? 0 : amount;
    const newCustomAmounts = { ...customAmounts, [userId]: validAmount };
    setCustomAmounts(newCustomAmounts);
    form.setValue('customAmounts', newCustomAmounts, { shouldValidate: true });
  };

  const calculateRemainingAmount = () => {
    if (!customAmounts || Object.keys(customAmounts).length === 0) return totalAmount;
    const totalCustomAmount = Object.values(customAmounts).reduce((sum, amount) => sum + (isNaN(amount) ? 0 : amount), 0);
    return totalAmount - totalCustomAmount;
  };

  const getTotalCustomAmount = () => {
    if (!customAmounts || Object.keys(customAmounts).length === 0) return 0;
    return Object.values(customAmounts).reduce((sum, amount) => sum + (isNaN(amount) ? 0 : amount), 0);
  };

  const handleSplitTypeChange = (newSplitType: 'equal' | 'custom') => {
    try {
      form.setValue('splitType', newSplitType);
      if (newSplitType === 'equal') {
        setCustomAmounts({});
        form.setValue('customAmounts', {});
      } else {
        // Initialize custom amounts with equal split as starting point
        if (selectedSplitwiseUsers.length > 0 && totalAmount > 0) {
          const equalAmount = totalAmount / selectedSplitwiseUsers.length;
          const initialAmounts: Record<string, number> = {};
          selectedSplitwiseUsers.forEach(userId => {
            initialAmounts[userId] = Number(equalAmount.toFixed(2));
          });
          setCustomAmounts(initialAmounts);
          form.setValue('customAmounts', initialAmounts);
        }
      }
    } catch (error) {
      console.error('Error changing split type:', error);
    }
  };
  
  const handleUserMultiSelect = (userId: string) => {
    const currentSelection = form.getValues('splitwiseUserIds') || [];
    const newSelection = currentSelection.includes(userId)
      ? currentSelection.filter(id => id !== userId)
      : [...currentSelection, userId];
    form.setValue('splitwiseUserIds', newSelection, { shouldValidate: true });

    // Update custom amounts when users change
    if (splitType === 'custom') {
      const newCustomAmounts = { ...customAmounts };
      if (newSelection.includes(userId) && !currentSelection.includes(userId)) {
        // User was added - set equal share of remaining
        const equalAmount = totalAmount / Math.max(newSelection.length, 1);
        newCustomAmounts[userId] = equalAmount;
      } else if (!newSelection.includes(userId) && currentSelection.includes(userId)) {
        // User was removed - delete their amount
        delete newCustomAmounts[userId];
      }
      setCustomAmounts(newCustomAmounts);
      form.setValue('customAmounts', newCustomAmounts, { shouldValidate: true });
    }
  }

  const handleGoToSplitwise = async () => {
    // Only validate the fields from the first step
    const result = await form.trigger(["amount", "date", "description", "accountId", "categoryId", "subCategoryId"]);
    if (result) {
      form.setValue('includeSplitwise', true);
      
      // Fetch splitwise data only if it hasn't been fetched yet
      if(splitwiseGroups.length === 0 && !isSplitwiseLoading) {
          setIsSplitwiseLoading(true); setSplitwiseError(null);
          try {
              const res = await fetch('/api/splitwise');
              if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch Splitwise data');
              const data = await res.json();
              setSplitwiseGroups(data.groups || []);
          } catch (error) {
              setSplitwiseError(error instanceof Error ? error.message : "An unknown error occurred");
          } finally {
              setIsSplitwiseLoading(false);
          }
      }
      setStep(2);
    }
  }

  const renderSplitwiseContent = () => {
    if (isSplitwiseLoading) {
      return (
        <div className="flex items-center justify-center p-8 space-x-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading Splitwise groups...</span>
        </div>
      );
    }

    if (splitwiseError) {
      return (
         <div className="text-red-600 flex items-center justify-center p-4 bg-red-50 rounded-md my-4">
            <AlertCircle className="h-5 w-5 mr-2" />
            Error: {splitwiseError}
        </div>
      );
    }

    const totalCustomAmount = getTotalCustomAmount();
    const remainingAmount = calculateRemainingAmount();
    const isCustomAmountValid = Math.abs(remainingAmount) < 0.01;

    return (
      <div className="space-y-4 rounded-md border p-4">
          <FormField
              control={form.control}
              name="splitwiseGroupId"
              render={({ field }) => (
                  <FormItem>
                  <FormLabel>Splitwise Group</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                      <SelectTrigger>
                          <SelectValue placeholder="Select a Splitwise group" />
                      </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                      {splitwiseGroups.map(group => (
                          <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                      ))}
                      </SelectContent>
                  </Select>
                  <FormMessage />
                  </FormItem>
              )}
          />
          <FormItem>
              <FormLabel>Split with</FormLabel>
              <Popover>
                  <PopoverTrigger asChild>
                  <FormControl>
                      <Button
                      variant="outline"
                      className="w-full justify-start font-normal"
                      disabled={!selectedSplitwiseGroupId}
                      >
                      <Users className="mr-2 h-4 w-4" />
                      {selectedSplitwiseUsers.length > 0
                          ? `${selectedSplitwiseUsers.length} user(s) selected`
                          : 'Select users'}
                      </Button>
                  </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                      <ScrollArea className="h-48">
                          <div className="p-2 space-y-1">
                            {splitwiseUsers.length > 0 ? (
                                splitwiseUsers.map((user) => (
                                <div
                                    key={user.id}
                                    onClick={() => handleUserMultiSelect(user.id)}
                                    className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
                                >
                                    <Checkbox
                                        className="mr-2"
                                        checked={selectedSplitwiseUsers.includes(user.id)}
                                    />
                                    {user.name}
                                </div>
                                ))
                            ) : (
                                <p className='py-6 text-center text-sm text-muted-foreground'>No users found.</p>
                            )}
                          </div>
                      </ScrollArea>
                  </PopoverContent>
              </Popover>
              <div className="pt-2">
                  {selectedSplitwiseUsers.map(id => {
                      const user = splitwiseUsers.find(u => u.id === id);
                      return <Badge key={id} variant="secondary" className="mr-1 mb-1">{user?.name}</Badge>
                  })}
              </div>
              <FormMessage />
          </FormItem>

          {selectedSplitwiseUsers.length > 0 && (
            <FormField
              control={form.control}
              name="splitType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Split Type</FormLabel>
                  <Select 
                    onValueChange={(value: 'equal' | 'custom') => {
                      field.onChange(value);
                      handleSplitTypeChange(value);
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select split type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="equal">Equal Split</SelectItem>
                      <SelectItem value="custom">Custom Amounts</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {splitType === 'custom' && selectedSplitwiseUsers.length > 0 && (
            <FormField
              control={form.control}
              name="customAmounts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Amounts</FormLabel>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                    {selectedSplitwiseUsers.map(userId => {
                      const user = splitwiseUsers.find(u => u.id === userId);
                      return (
                        <div key={userId} className="flex items-center justify-between space-x-2">
                          <span className="text-sm font-medium min-w-0 flex-1">{user?.name}</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={customAmounts[userId] || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '') {
                                updateCustomAmount(userId, 0);
                              } else {
                                const numValue = parseFloat(value);
                                if (!isNaN(numValue)) {
                                  updateCustomAmount(userId, numValue);
                                }
                              }
                            }}
                            className="w-24 text-right"
                            placeholder="0.00"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Total Amount:</span>
                      <span className="font-medium">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Allocated:</span>
                      <span className="font-medium">₹{totalCustomAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className={cn(
                      "flex justify-between font-medium",
                      isCustomAmountValid ? "text-green-600" : "text-red-600"
                    )}>
                      <span>Remaining:</span>
                      <span>₹{remainingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {!isCustomAmountValid && (
                      <p className="text-red-600 text-xs">
                        Custom amounts must total exactly ₹{totalAmount}
                      </p>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {splitType === 'equal' && selectedSplitwiseUsers.length > 0 && (
            <div className="text-sm text-muted-foreground border rounded-md p-3">
              <div className="flex justify-between">
                <span>Amount per person:</span>
                <span className="font-medium">₹{(totalAmount / selectedSplitwiseUsers.length).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Expense' : (step === 1 ? 'Add New Expense' : 'Add Splitwise Details')}</DialogTitle>
          <DialogDescription>
             {step === 1 
               ? `Fill in the details below to ${isEditMode ? 'update this' : 'add a new'} expense transaction.`
               : "Select the group and users to split this expense with."
             }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                    name="charges"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Charges</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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
                        <Input placeholder="e.g., Groceries from store" {...field} />
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
                        <FormLabel>Paid From</FormLabel>
                        <Select 
                            onValueChange={(value) => {
                                field.onChange(value);
                                console.log('Account selected:', value);
                            }} 
                            value={field.value}
                        >
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
                        <FormLabel>Expense Category</FormLabel>
                        <Select 
                            onValueChange={(value) => {
                                field.onChange(value);
                                console.log('Category selected:', value);
                            }} 
                            value={field.value}
                        >
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
                
                {/* Credit Card Cap Selection */}
                {selectedAccountId && accounts.find(acc => acc.id === selectedAccountId)?.type === 'Credit Card' && (
                  <FormField
                    control={form.control}
                    name="capId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credit Card Cap (Optional)</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                          value={field.value ?? "none"} 
                          disabled={isCapsLoading || creditCardCaps.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue 
                                placeholder={
                                  isCapsLoading 
                                    ? "Loading caps..." 
                                    : creditCardCaps.length === 0 
                                      ? "No caps available" 
                                      : "Select a cap"
                                } 
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {creditCardCaps.map(cap => (
                              <SelectItem key={cap.id} value={cap.id}>
                                {cap.capName} - ₹{Math.trunc(cap.remainingAmount).toLocaleString('en-IN')} remaining (₹{Math.trunc(cap.capCurrentAmount).toLocaleString('en-IN')}/₹{Math.trunc(cap.capTotalAmount).toLocaleString('en-IN')})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {/* Show Splitwise indicator if expense has Splitwise data */}
                {isEditMode && initialValues?.splitwiseGroupId && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">
                          This expense is split on Splitwise
                        </span>
                      </div>
                      <Button 
                        type="button" 
                        variant="link" 
                        size="sm"
                        onClick={async () => {
                          // Ensure Splitwise data is loaded before navigating
                          if (splitwiseGroups.length === 0 && !isSplitwiseLoading) {
                            await handleGoToSplitwise();
                          } else {
                            setStep(2);
                          }
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View Details →
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && renderSplitwiseContent()}
            
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
              {step === 1 && (
                <>
                  <Button type="submit" disabled={isLoading} onClick={() => form.setValue('includeSplitwise', false)}>
                    {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Expense' : 'Add Expense')}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleGoToSplitwise} disabled={isSplitwiseLoading}>
                    {isSplitwiseLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Next: Add Splitwise
                  </Button>
                </>
              )}
              {step === 2 && (
                 <>
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Expense & Split' : 'Add Expense & Split')}
                    </Button>
                 </>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}