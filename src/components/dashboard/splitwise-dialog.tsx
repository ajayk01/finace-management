"use client";

import { useState } from "react";
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
import { AlertCircle, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

export interface FriendBalance {
  name: string;
  splitwiseAmount: number | null;
  notionAmount: number | null;
  pageId?: string;
}

interface BankAccount {
  id: string;
  name: string;
}

interface SplitwiseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: FriendBalance[];
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
  bankAccounts: BankAccount[];
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
  // If either amount is null, show muted color
  if (splitwiseAmount === null || notionAmount === null) return "text-muted-foreground";
  
  // If amounts don't match, highlight in red
  if (splitwiseAmount !== notionAmount) return "text-red-600";
  
  // If amounts match, show in black
  return "text-foreground";
};

export function SplitwiseDialog({
  open,
  onOpenChange,
  data,
  isLoading,
  error,
  onRefresh,
  bankAccounts
}: SplitwiseDialogProps) {
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [settlingFriend, setSettlingFriend] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSettleUp = async (friendName: string, friendPageId?: string) => {
    if (!selectedBankAccount) {
      toast({
        title: 'Select Bank Account',
        description: 'Please select a bank account first.',
        variant: 'destructive',
      });
      return;
    }

    setSettlingFriend(friendName);
    try {
      // First fetch transactions for the friend - prefer pageId if available
      const queryParam = friendPageId 
        ? `friendPageId=${encodeURIComponent(friendPageId)}`
        : `friendName=${encodeURIComponent(friendName)}`;
      
      const transactionsResponse = await fetch(`/api/friend-transactions?${queryParam}`);
      if (!transactionsResponse.ok) {
        throw new Error('Failed to fetch friend transactions');
      }
      const transactionsData = await transactionsResponse.json();
      console.log("Fetched trans",transactionsData)
      if (!transactionsData.transactions || transactionsData.transactions.length === 0) {
        toast({
          title: 'No Transactions Found',
          description: `No transactions found for ${friendName}. Cannot settle up.`,
          variant: 'destructive',
        });
        return;
      }

      // Create settlement with all transactions
      const settlementResponse = await fetch('/api/settle-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          friendName: friendName,
          bankAccountId: selectedBankAccount,
          transactions: transactionsData.transactions.map((t: any) => ({
            id: t.id,
            amount: t.amount,
            splitwiseId: t.splitwiseId
          })),
        }),
      });

      if (!settlementResponse.ok) {
        throw new Error('Failed to create settlement');
      }

      const settlementData = await settlementResponse.json();
      
      toast({
        title: 'Settlement Created',
        description: settlementData.message,
      });

      // Refresh data
      if (onRefresh) {
        onRefresh();
      }

    } catch (error) {
      console.error('Error creating settlement:', error);
      toast({
        title: 'Error',
        description: 'Failed to create settlement. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSettlingFriend(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[70vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Splitwise Balance Summary</DialogTitle>
              <DialogDescription>
                Comparison of balances from Splitwise and Notion.
              </DialogDescription>
            </div>
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
          </div>
        </DialogHeader>
        
        {/* Bank Account Selection */}
        <div className="px-1 pb-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Bank Account for Settlements</label>
            <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Choose bank account for settlements" />
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
        </div>
        
        <div className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4">
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
            ) : data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Friend</TableHead>
                    <TableHead className="text-right">Splitwise</TableHead>
                    <TableHead className="text-right">Notion</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((friend) => {
                    const isMatched = friend.splitwiseAmount === friend.notionAmount;
                    return (
                      <TableRow key={friend.name} className={cn(!isMatched && "bg-red-50 hover:bg-red-100")}>
                        <TableCell className="font-medium">{friend.name}</TableCell>
                        <TableCell className={cn("text-right font-semibold", getAmountColor(friend.splitwiseAmount, friend.notionAmount))}>
                          <div className="flex items-center justify-end gap-1">
                            {friend.splitwiseAmount !== null && friend.splitwiseAmount > 0 && <ArrowUp className="h-3 w-3" />}
                            {friend.splitwiseAmount !== null && friend.splitwiseAmount < 0 && <ArrowDown className="h-3 w-3" />}
                            {formatCurrency(friend.splitwiseAmount)}
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-right font-semibold", getAmountColor(friend.splitwiseAmount, friend.notionAmount))}>
                          <div className="flex items-center justify-end gap-1">
                            {friend.notionAmount !== null && friend.notionAmount > 0 && <ArrowUp className="h-3 w-3" />}
                            {friend.notionAmount !== null && friend.notionAmount < 0 && <ArrowDown className="h-3 w-3" />}
                            {formatCurrency(friend.notionAmount)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSettleUp(friend.name, friend.pageId)}
                            disabled={settlingFriend === friend.name}
                            className="text-xs"
                          >
                            {settlingFriend === friend.name ? 'Settling...' : 'Settle Up'}
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
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}