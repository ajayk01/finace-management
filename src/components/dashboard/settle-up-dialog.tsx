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
}

interface SettleUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: Friend[];
  bankAccounts: BankAccount[];
}

export function SettleUpDialog({ open, onOpenChange, friends, bankAccounts }: SettleUpDialogProps) {
  const [selectedFriend, setSelectedFriend] = useState<string>('');
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);
  const { toast } = useToast();

  // Fetch transactions when friend is selected
  useEffect(() => {
    if (selectedFriend) {
      fetchFriendTransactions(selectedFriend);
    } else {
      setTransactions([]);
      setSelectedTransactions(new Set());
    }
  }, [selectedFriend]);

  const fetchFriendTransactions = async (friendName: string) => {
    setIsFetchingTransactions(true);
    try {
      const response = await fetch(`/api/friend-transactions?friendName=${encodeURIComponent(friendName)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      const data = await response.json();
      setTransactions(data.transactions || []);
      setSelectedTransactions(new Set()); // Reset selection
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

  const handleTransactionSelection = (transactionId: string, checked: boolean) => {
    const newSelection = new Set(selectedTransactions);
    if (checked) {
      newSelection.add(transactionId);
    } else {
      newSelection.delete(transactionId);
    }
    setSelectedTransactions(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedTransactions.size === transactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(transactions.map(t => t.id)));
    }
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

    if (selectedTransactions.size === 0) {
      toast({
        title: 'No Transactions Selected',
        description: 'Please select at least one transaction to settle.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/settle-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          friendName: selectedFriend,
          bankAccountId: selectedBankAccount,
          transactionIds: Array.from(selectedTransactions),
        }),
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
      setSelectedFriend('');
      setSelectedBankAccount('');
      setTransactions([]);
      setSelectedTransactions(new Set());
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

  const selectedAmount = transactions
    .filter(t => selectedTransactions.has(t.id))
    .reduce((sum, t) => sum + t.amount, 0);

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
                    key={friend.name}
                    className={`cursor-pointer transition-colors ${
                      selectedFriend === friend.name ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedFriend(friend.name)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{friend.name}</span>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            Splitwise: ₹{friend.splitwiseAmount.toFixed(2)}
                          </div>
                          <div className="text-sm text-gray-600">
                            Notion: ₹{friend.notionAmount.toFixed(2)}
                          </div>
                          <div className="font-semibold">
                            Difference: ₹{(friend.splitwiseAmount - friend.notionAmount).toFixed(2)}
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

          {/* Transactions Table */}
          {selectedFriend && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">
                  Transactions for {selectedFriend}
                  {isFetchingTransactions && <span className="text-sm text-gray-500 ml-2">(Loading...)</span>}
                </h3>
                {transactions.length > 0 && (
                  <div className="flex gap-2 items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      {selectedTransactions.size === transactions.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <span className="text-sm text-gray-600">
                      Selected: ₹{selectedAmount.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              
              {transactions.length > 0 ? (
                <div className="max-h-80 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Select</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Sub Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedTransactions.has(transaction.id)}
                              onCheckedChange={(checked) => 
                                handleTransactionSelection(transaction.id, checked as boolean)
                              }
                            />
                          </TableCell>
                          <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                          <TableCell>{transaction.description}</TableCell>
                          <TableCell>{transaction.category}</TableCell>
                          <TableCell>{transaction.subCategory}</TableCell>
                          <TableCell className="text-right">₹{transaction.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : !isFetchingTransactions ? (
                <div className="text-center py-8 text-gray-500">
                  No transactions found for {selectedFriend}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSettle}
            disabled={!selectedFriend || !selectedBankAccount || selectedTransactions.size === 0 || isLoading}
          >
            {isLoading ? 'Creating Settlement...' : `Settle ₹${selectedAmount.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
