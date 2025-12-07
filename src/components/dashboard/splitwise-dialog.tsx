"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowDown, ArrowUp, RefreshCw, RefreshCcw, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";

export interface FriendBalance {
  name: string;
  splitwiseAmount: number | null;
  notionAmount: number | null;
  pageId?: string;
  friendId?: number;
}

interface BankAccount {
  id: string;
  name: string;
}

interface Category {
  id: string | number;
  name: string;
  budget: number;
  type: number;
  subcategories?: SubCategory[];
}

interface SubCategory {
  id: string | number;
  name: string;
  budget: number;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  subCategory: string;
  accountId: string;
  splitwiseId?: string;
}

interface UnsettledExpense {
  splitwiseTransactionId: string;
  friendId: number;
  friendName: string;
  date: string;
  description: string;
  splitedAmount: number;
  totalAmount: number;
  categoryId: number | null;
  subCategoryId: number | null;
  error?: boolean;
}

interface SplitwiseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: FriendBalance[];
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
  onSync?: () => void;
  bankAccounts: BankAccount[];
  categories: Category[];
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || typeof amount === 'undefined') return "₹ --.--";
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getAmountColor = (splitwiseAmount: number | null, notionAmount: number | null) => {
  if (splitwiseAmount === null || notionAmount === null) return "text-muted-foreground";
  if (splitwiseAmount !== notionAmount) return "text-red-600";
  return "text-foreground";
};

export function SplitwiseDialog({
  open,
  onOpenChange,
  data,
  isLoading,
  error,
  onRefresh,
  onSync,
  bankAccounts,
  categories
}: SplitwiseDialogProps) {
  const [selectedFriend, setSelectedFriend] = useState<FriendBalance | null>(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [unsettledExpenses, setUnsettledExpenses] = useState<UnsettledExpense[]>([]);
  const [expenseSelections, setExpenseSelections] = useState<Record<string, { categoryId: number | null, subCategoryId: number | null }>>({});
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);
  const [isFetchingUnsettled, setIsFetchingUnsettled] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const { toast } = useToast();

  // Filter for expense categories (type 1) only
  const categoriesWithSubcategories = (categories || [])
    .filter(cat => cat.type === 1)
    .map(cat => ({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      budget: cat.budget,
      subcategories: cat.subcategories || [],
    }));

  // Fetch transactions and unsettled expenses when friend is selected
  useEffect(() => {
    if (selectedFriend?.friendId) {
      fetchFriendTransactions(selectedFriend.friendId, selectedFriend.name);
      fetchUnsettledExpenses(selectedFriend.friendId);
    } else {
      setTransactions([]);
      setUnsettledExpenses([]);
      setExpenseSelections({});
    }
  }, [selectedFriend]);

  const fetchUnsettledExpenses = async (friendId: number) => {
    setIsFetchingUnsettled(true);
    try {
      const response = await fetch(`/api/unsettled-splitwise-expenses?friendId=${friendId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch unsettled expenses');
      }
      const data = await response.json();
      setUnsettledExpenses(data.expenses || []);
      
      const initialSelections: Record<string, { categoryId: number | null, subCategoryId: number | null }> = {};
      data.expenses.forEach((exp: UnsettledExpense) => {
        initialSelections[exp.splitwiseTransactionId] = {
          categoryId: exp.categoryId,
          subCategoryId: exp.subCategoryId,
        };
      });
      setExpenseSelections(initialSelections);
    } catch (error) {
      console.error('Error fetching unsettled expenses:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch unsettled expenses.',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingUnsettled(false);
    }
  };

  const fetchFriendTransactions = async (friendId: number, friendName: string) => {
    setIsFetchingTransactions(true);
    try {
      const response = await fetch(`/api/friend-transactions?friendId=${friendId}&friendName=${encodeURIComponent(friendName)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch friend transactions.',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingTransactions(false);
    }
  };

  const handleCategoryChange = (splitwiseTransactionId: string, categoryId: number) => {
    setExpenseSelections(prev => ({
      ...prev,
      [splitwiseTransactionId]: {
        categoryId,
        subCategoryId: null,
      },
    }));
  };

  const handleSubCategoryChange = (splitwiseTransactionId: string, subCategoryId: number) => {
    setExpenseSelections(prev => ({
      ...prev,
      [splitwiseTransactionId]: {
        ...prev[splitwiseTransactionId],
        subCategoryId,
      },
    }));
  };

  const handleSettleUp = async (friend: FriendBalance) => {
    if (!friend.friendId) {
      toast({
        title: 'Friend ID Missing',
        description: 'Cannot settle up: Friend database ID is missing.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedFriend(friend);
  };

  const handleBackToList = () => {
    setSelectedFriend(null);
    setSelectedBankAccount('');
    setTransactions([]);
    setUnsettledExpenses([]);
    setExpenseSelections({});
  };

  const handleSettle = async () => {
    if (!selectedFriend || !selectedBankAccount) {
      toast({
        title: 'Missing Information',
        description: 'Please select a bank account.',
        variant: 'destructive',
      });
      return;
    }

    if (unsettledExpenses.length > 0) {
      const missingSelections = unsettledExpenses.filter(
        exp => !expenseSelections[exp.splitwiseTransactionId]?.categoryId
      );
      
      if (missingSelections.length > 0) {
        toast({
          title: 'Missing Category Selection',
          description: 'Please select a category for all unsettled expenses.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSettling(true);
    try {
      const payload = {
        friendId: selectedFriend.friendId,
        bankAccountId: selectedBankAccount,
        unsettledExpenses: unsettledExpenses.map(exp => ({
          splitwiseTransactionId: exp.splitwiseTransactionId,
          date: exp.date,
          description: exp.description,
          splitedAmount: exp.splitedAmount,
          categoryId: expenseSelections[exp.splitwiseTransactionId]?.categoryId,
          subCategoryId: expenseSelections[exp.splitwiseTransactionId]?.subCategoryId,
        })),
      };
      
      const response = await fetch('/api/settle-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to create settlement');
      }

      const data = await response.json();
      
      toast({
        title: 'Settlement Created',
        description: data.message,
      });

      handleBackToList();
      if (onRefresh) {
        onRefresh();
      }

    } catch (error) {
      console.error('Error creating settlement:', error);
      toast({
        title: 'Error',
        description: 'Failed to create settlement entries.',
        variant: 'destructive',
      });
    } finally {
      setIsSettling(false);
    }
  };

  const filteredData = (data || []).filter((friend) => {
    const splitwiseIsEmpty = friend.splitwiseAmount === null || 
                             friend.splitwiseAmount === undefined || 
                             Math.abs(friend.splitwiseAmount || 0) < 0.01;
    const notionIsEmpty = friend.notionAmount === null || 
                          friend.notionAmount === undefined || 
                          Math.abs(friend.notionAmount || 0) < 0.01;
    
    return !(splitwiseIsEmpty && notionIsEmpty);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl md:max-w-6xl h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedFriend && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToList}
                  className="flex items-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              <div>
                <DialogTitle className="text-xl font-bold">
                  {selectedFriend ? `Settle Up with ${selectedFriend.name}` : 'Splitwise Balance Summary'}
                </DialogTitle>
                <DialogDescription className="text-sm mt-2">
                  {selectedFriend 
                    ? 'Select bank account and categories for unsettled expenses.'
                    : 'Comparison of balances from Splitwise and Notion.'}
                </DialogDescription>
              </div>
            </div>
            {!selectedFriend && (
              <div className="flex items-center gap-2">
                {onSync && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSync}
                    disabled={isLoading}
                    className="flex items-center gap-2 border-green-600 text-green-600 hover:bg-green-50"
                  >
                    <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Sync Splitwise
                  </Button>
                )}
                {onRefresh && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="flex items-center gap-2 border-blue-600 text-blue-600 hover:bg-blue-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>      
        
        <div className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4 pb-4">
            {!selectedFriend ? (
              // Friends List View
              <>
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4 p-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-4 w-1/3" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="text-red-600 flex items-center justify-center p-4 bg-red-50 rounded-md my-4">
                    <AlertCircle className="h-5 w-5 mr-2" />
                    Error: {error}
                  </div>
                ) : filteredData.length > 0 ? (
                  <Table className="border">
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-bold text-base w-1/3">Friend</TableHead>
                        <TableHead className="text-right font-bold text-base">Splitwise</TableHead>
                        <TableHead className="text-right font-bold text-base">Notion</TableHead>
                        <TableHead className="text-right font-bold text-base w-1/6">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((friend) => {
                        const splitwise = friend.splitwiseAmount || 0;
                        const notion = friend.notionAmount || 0;
                        const isMatched = Math.abs(splitwise - notion) < 0.01;
                        return (
                          <TableRow key={friend.name} className={cn("py-3 transition-colors", isMatched ? "hover:bg-slate-50" : "bg-red-50 hover:bg-red-100")}>
                            <TableCell className="font-medium text-base py-3">{friend.name}</TableCell>
                            <TableCell className={cn("text-right font-semibold py-3", getAmountColor(friend.splitwiseAmount, friend.notionAmount))}>
                              <div className="flex items-center justify-end gap-1">
                                {friend.splitwiseAmount !== null && friend.splitwiseAmount > 0 && <ArrowUp className="h-4 w-4 text-green-600" />}
                                {friend.splitwiseAmount !== null && friend.splitwiseAmount < 0 && <ArrowDown className="h-4 w-4 text-red-600" />}
                                <span className="text-base">{formatCurrency(friend.splitwiseAmount)}</span>
                              </div>
                            </TableCell>
                            <TableCell className={cn("text-right font-semibold py-3", getAmountColor(friend.splitwiseAmount, friend.notionAmount))}>
                              <div className="flex items-center justify-end gap-1">
                                {friend.notionAmount !== null && friend.notionAmount > 0 && <ArrowUp className="h-4 w-4 text-green-600" />}
                                {friend.notionAmount !== null && friend.notionAmount < 0 && <ArrowDown className="h-4 w-4 text-red-600" />}
                                <span className="text-base">{formatCurrency(friend.notionAmount)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right py-3">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleSettleUp(friend)}
                                disabled={!friend.friendId}
                                className="px-4 py-1 h-8 bg-blue-600 hover:bg-blue-700 text-white"
                              >
                                Settle Up
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">No friend balances to display.</p>
                  </div>
                )}
              </>
            ) : (
              // Settlement View
              <div className="space-y-6">
                {/* Bank Account Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Bank Account *</label>
                  <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Unsettled Expenses */}
                {unsettledExpenses.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-orange-600">
                        Unsettled Expenses (Requires Category Selection)
                        {isFetchingUnsettled && <span className="text-sm text-gray-500 ml-2">(Loading...)</span>}
                      </h3>
                      <div className="text-sm text-gray-600">
                        Total: ₹{unsettledExpenses.reduce((sum, exp) => sum + (Number(exp.splitedAmount) || 0), 0).toFixed(2)}
                      </div>
                    </div>
                    
                    <div className="max-h-96 overflow-y-auto border rounded-md p-4 space-y-4 bg-orange-50">
                      {unsettledExpenses.map((expense, index) => {
                        const selectedCategoryId = expenseSelections[expense.splitwiseTransactionId]?.categoryId;
                        const selectedCategory = selectedCategoryId ? categoriesWithSubcategories.find(
                          cat => cat.id.toString() === selectedCategoryId.toString()
                        ) : null;
                        
                        return (
                          <Card key={expense.splitwiseTransactionId || `expense-${index}`} className="bg-white">
                            <CardContent className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium text-gray-600">Date:</span>
                                    <span className="text-sm">{expense.date ? new Date(expense.date).toLocaleDateString() : 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium text-gray-600">Description:</span>
                                    <span className="text-sm">{expense.description}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium text-gray-600">Your Share:</span>
                                    <span className="text-sm font-semibold">₹{(Number(expense.splitedAmount) || 0).toFixed(2)}</span>
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <div>
                                    <label className="text-sm font-medium">Expense Category *</label>
                                    <Select
                                      value={expenseSelections[expense.splitwiseTransactionId]?.categoryId?.toString() || ''}
                                      onValueChange={(value) => handleCategoryChange(expense.splitwiseTransactionId, parseInt(value))}
                                    >
                                      <SelectTrigger className="mt-1">
                                        <SelectValue placeholder="Select category" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {categoriesWithSubcategories.filter(cat => cat?.id).map((category) => (
                                          <SelectItem key={category.id} value={category.id.toString()}>
                                            {category.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  
                                  {selectedCategory && selectedCategory.subcategories.length > 0 && (
                                    <div>
                                      <label className="text-sm font-medium">Sub Category</label>
                                      <Select
                                        value={expenseSelections[expense.splitwiseTransactionId]?.subCategoryId?.toString() || ''}
                                        onValueChange={(value) => handleSubCategoryChange(expense.splitwiseTransactionId, parseInt(value))}
                                      >
                                        <SelectTrigger className="mt-1">
                                          <SelectValue placeholder="Select sub category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {selectedCategory.subcategories.map((subcat) => (
                                            <SelectItem key={subcat.id} value={subcat.id.toString()}>
                                              {subcat.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Settled Transactions Table */}
                {transactions.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold">
                        Already Paid Transactions
                        {isFetchingTransactions && <span className="text-sm text-gray-500 ml-2">(Loading...)</span>}
                      </h3>
                      <div className="text-sm text-gray-600">
                        Total: ₹{transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0).toFixed(2)}
                      </div>
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Sub Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((transaction, index) => (
                            <TableRow key={transaction.id || `transaction-${index}`}>
                              <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                              <TableCell>{transaction.description}</TableCell>
                              <TableCell>{transaction.category}</TableCell>
                              <TableCell>{transaction.subCategory}</TableCell>
                              <TableCell className="text-right">₹{(Number(transaction.amount) || 0).toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                
                {!isFetchingUnsettled && unsettledExpenses.length === 0 && transactions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No unsettled transactions found for {selectedFriend?.name}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {selectedFriend && (
          <DialogFooter>
            <Button
              onClick={handleSettle}
              disabled={
                !selectedBankAccount || 
                isSettling ||
                (unsettledExpenses.length > 0 && unsettledExpenses.some(
                  exp => !expenseSelections[exp.splitwiseTransactionId]?.categoryId
                ))
              }
            >
              {isSettling ? 'Creating Settlement...' : (() => {
                const alreadyPaidTotal = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
                const unsettledTotal = unsettledExpenses.reduce((sum, exp) => sum + (Number(exp.splitedAmount) || 0), 0);
                const amountToSettle = alreadyPaidTotal - unsettledTotal;
                return `Settle All (₹${amountToSettle.toFixed(2)})`;
              })()}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
