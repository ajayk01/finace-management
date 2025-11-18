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
import { AlertCircle, ArrowDown, ArrowUp, RefreshCw, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { SettleUpDialog } from "./settle-up-dialog";

export interface FriendBalance {
  name: string;
  splitwiseAmount: number | null;
  notionAmount: number | null;
  pageId?: string; // Legacy Notion page ID (deprecated)
  friendId?: number; // Database ID from SplitwiseFriends table
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
  onSync,
  bankAccounts,
  categories
}: SplitwiseDialogProps) {
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [settleUpDialogOpen, setSettleUpDialogOpen] = useState(false);
  const [selectedFriendForSettle, setSelectedFriendForSettle] = useState<FriendBalance | null>(null);
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

  const handleSettleUp = async (friendName: string, friendId?: number) => {
    if (!friendId) {
      toast({
        title: 'Friend ID Missing',
        description: 'Cannot settle up: Friend database ID is missing.',
        variant: 'destructive',
      });
      return;
    }

    // Find the friend object
    const friend = data?.find((f: FriendBalance) => f.friendId === friendId);
    if (!friend) {
      toast({
        title: 'Friend Not Found',
        description: 'Unable to find friend data.',
        variant: 'destructive',
      });
      return;
    }

    // Open the settle-up dialog with the selected friend
    setSelectedFriendForSettle(friend);
    setSettleUpDialogOpen(true);
  };

  const handleSettleUpComplete = () => {
    // Refresh data after settlement
    if (onRefresh) {
      onRefresh();
    }
    setSettleUpDialogOpen(false);
    setSelectedFriendForSettle(null);
  };

  // Filter out friends where both amounts are null/undefined/0
  const filteredData = (data || []).filter((friend) => {
    const splitwiseIsEmpty = friend.splitwiseAmount === null || 
                             friend.splitwiseAmount === undefined || 
                             Math.abs(friend.splitwiseAmount || 0) < 0.01;
    const notionIsEmpty = friend.notionAmount === null || 
                          friend.notionAmount === undefined || 
                          Math.abs(friend.notionAmount || 0) < 0.01;
    
    // Keep the friend only if at least one amount is non-zero
    return !(splitwiseIsEmpty && notionIsEmpty);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl md:max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">Splitwise Balance Summary</DialogTitle>
              <DialogDescription className="text-sm mt-2">
                Comparison of balances from Splitwise and Notion.
              </DialogDescription>
            </div>
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
          </div>
        </DialogHeader>      
        
        <div className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4 pb-4">
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
                    // Use tolerance for floating point comparison
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
                            onClick={() => handleSettleUp(friend.name, friend.friendId)}
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
          </ScrollArea>
        </div>
      </DialogContent>

      {/* Settle Up Dialog */}
      {selectedFriendForSettle && (
        <SettleUpDialog
          open={settleUpDialogOpen}
          onOpenChange={(open) => {
            setSettleUpDialogOpen(open);
            if (!open) {
              setSelectedFriendForSettle(null);
            } else {
              handleSettleUpComplete();
            }
          }}
          friends={[{
            name: selectedFriendForSettle.name,
            splitwiseAmount: selectedFriendForSettle.splitwiseAmount || 0,
            notionAmount: selectedFriendForSettle.notionAmount || 0,
            friendId: selectedFriendForSettle.friendId,
          }]}
          bankAccounts={bankAccounts}
          categories={categoriesWithSubcategories}
        />
      )}
    </Dialog>
  );
}