"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";

export interface FriendBalance {
  name: string;
  splitwiseAmount: number | null;
  notionAmount: number | null;
}

interface SplitwiseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: FriendBalance[];
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
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

export function SplitwiseDialog({ open, onOpenChange, data, isLoading, error, onRefresh }: SplitwiseDialogProps) {
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