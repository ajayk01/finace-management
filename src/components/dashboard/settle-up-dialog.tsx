'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Friend {
  name: string;
  splitwiseAmount: number;
  notionAmount: number;
  friendId?: number; // Database ID for the friend
}

interface BankAccount {
  id: string;
  name: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  subCategory: string;
  accountId: string;
  splitwiseId?: string; // Splitwise transaction ID
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

interface Category {
  id: string | number;
  name: string;
  type: number;
  budget: number;
  subcategories: SubCategory[];
}

interface SubCategory {
  id: string | number;
  name: string;
  budget: number;
}

interface SettleUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: Friend[];
  bankAccounts: BankAccount[];
  categories: Category[];
}

export function SettleUpDialog({ open, onOpenChange, friends, bankAccounts, categories }: SettleUpDialogProps) {
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [unsettledExpenses, setUnsettledExpenses] = useState<UnsettledExpense[]>([]);
  const [expenseSelections, setExpenseSelections] = useState<Record<string, { categoryId: number | null, subCategoryId: number | null }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);
  const [isFetchingUnsettled, setIsFetchingUnsettled] = useState(false);
  const { toast } = useToast();

  // Fetch transactions when friend is selected
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
      console.log('Fetched unsettled expenses:', data.expenses);
      setUnsettledExpenses(data.expenses || []);
      
      // Initialize expense selections
      const initialSelections: Record<string, { categoryId: number | null, subCategoryId: number | null }> = {};
      data.expenses.forEach((exp: UnsettledExpense) => {
        initialSelections[exp.splitwiseTransactionId] = {
          categoryId: exp.categoryId,
          subCategoryId: exp.subCategoryId,
        };
      });
      setExpenseSelections(initialSelections);
      console.log('Initialized expense selections:', initialSelections);
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
        subCategoryId: null, // Reset subcategory when category changes
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

  const handleSettle = async () => {
    if (!selectedFriend || !selectedBankAccount) {
      toast({
        title: 'Missing Information',
        description: 'Please select both a friend and a bank account.',
        variant: 'destructive',
      });
      return;
    }

    // Check if unsettled expenses exist and validate selections
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

    setIsLoading(true);
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
      
      console.log('Settling up with payload:', payload);
      
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

      // Reset form
      setSelectedFriend(null);
      setSelectedBankAccount('');
      setTransactions([]);
      setUnsettledExpenses([]);
      setExpenseSelections({});
      onOpenChange(false);

    } catch (error) {
      console.error('Error creating settlement:', error);
      toast({
        title: 'Error',
        description: 'Failed to create settlement entries.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settle Up with Friends</DialogTitle>
          <DialogDescription>
            Select a friend and bank account to settle outstanding balances.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Friend Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Select Friend to Settle</h3>
            <div className="grid gap-3 max-h-60 overflow-y-auto">
              {friends.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No friends data available. Please load Splitwise data first by clicking the Splitwise button.
                </div>
              ) : (
                friends.map((friend) => (
                  <Card 
                    key={friend.friendId || friend.name}
                    className={`cursor-pointer transition-colors ${
                      selectedFriend?.name === friend.name ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedFriend(friend)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{friend.name}</span>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            Splitwise: ₹{(Number(friend.splitwiseAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-sm text-gray-600">
                            Notion: ₹{(Number(friend.notionAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="font-semibold">
                            Difference: ₹{((Number(friend.splitwiseAmount) || 0) - (Number(friend.notionAmount) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Bank Account Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Bank Account</label>
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

          {/* Unsettled Expenses - Need Category Selection */}
          {selectedFriend && unsettledExpenses.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-orange-600">
                  Unsettled Expenses (Requires Category Selection)
                  {isFetchingUnsettled && <span className="text-sm text-gray-500 ml-2">(Loading...)</span>}
                </h3>
                <div className="text-sm text-gray-600">
                  Total: ₹{unsettledExpenses.reduce((sum, exp) => sum + (Number(exp.splitedAmount) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              
              <div className="max-h-96 overflow-y-auto border rounded-md p-4 space-y-4 bg-orange-50">
                {unsettledExpenses.map((expense, index) => {
                  const selectedCategoryId = expenseSelections[expense.splitwiseTransactionId]?.categoryId;
                  const selectedCategory = selectedCategoryId ? categories.find(
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
                              <span className="text-sm font-semibold">₹{(Number(expense.splitedAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
                                  {categories.filter(cat => cat?.id).map((category) => (
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
          {selectedFriend && transactions.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">
                  Already Paid Transactions for {selectedFriend?.name}
                  {isFetchingTransactions && <span className="text-sm text-gray-500 ml-2">(Loading...)</span>}
                </h3>
                <div className="text-sm text-gray-600">
                  Total: ₹{transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                        <TableCell className="text-right">₹{(Number(transaction.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          {/* No unsettled expenses message */}
          {selectedFriend && !isFetchingUnsettled && unsettledExpenses.length === 0 && transactions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No unsettled transactions found for {selectedFriend?.name}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSettle}
            disabled={!selectedFriend || !selectedBankAccount || unsettledExpenses.length === 0 || isLoading}
          >
            {isLoading ? 'Creating Settlement...' : (() => {
              const alreadyPaidTotal = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
              const unsettledTotal = unsettledExpenses.reduce((sum, exp) => sum + (Number(exp.splitedAmount) || 0), 0);
              const amountToSettle = alreadyPaidTotal - unsettledTotal;
              return `Settle All (₹${amountToSettle.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
            })()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
