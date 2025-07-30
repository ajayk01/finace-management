
"use client";

import * as React from "react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface Transaction {
  id: string;
  date: string | null;
  description: string;
  amount: number;
  type: 'Income' | 'Expense' | 'Investment' | 'Transfer' | 'Other';
  category?: string;
  subCategory?: string;
}

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  title: string | null;
  isLoading: boolean;
  error: string | null;
  onLoadMore?: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  isExcludable?: boolean;
  excludedIds?: Set<string>;
  onToggleExclude?: (id: string) => void;
  onClearExclusions?: () => void;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return "Invalid Date";
  }
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function TransactionDialog({
  open,
  onOpenChange,
  transactions,
  title,
  isLoading,
  error,
  onLoadMore,
  hasMore,
  isLoadingMore,
  isExcludable = false,
  excludedIds,
  onToggleExclude,
  onClearExclusions,
}: TransactionDialogProps) {

  const isMonthlySummary = React.useMemo(() =>
    transactions.length > 0 && transactions.some(tx => tx.category),
    [transactions]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1200px] h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>{title || "Transactions"}</DialogTitle>
            {isExcludable && excludedIds && excludedIds.size > 0 && onClearExclusions && (
              <Button variant="outline" size="sm" onClick={onClearExclusions}>
                Clear Selection ({excludedIds.size})
              </Button>
            )}
          </div>
          <DialogDescription>
            {isExcludable
              ? "Showing the latest transactions. Check items to exclude them from expense totals."
              : "Showing the latest transactions."
            }
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-6">
            {isLoading ? (
              <div className="space-y-2">
               {[...Array(15)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4 p-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-2/4" />
                    <Skeleton className="h-4 w-1/4" />
                  </div>
                ))}
              </div>
            ) : error && transactions.length === 0 ? (
              <div className="text-red-600 flex items-center justify-center p-4 bg-red-50 rounded-md my-4">
                <AlertCircle className="h-5 w-5 mr-2" />
                Error loading transactions: {error}
              </div>
            ) : transactions.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isExcludable && <TableHead className="w-12 text-center">Exclude</TableHead>}
                      <TableHead>Date</TableHead>
                      {isMonthlySummary ? (
                        <>
                          <TableHead>Category</TableHead>
                          <TableHead>Sub-category</TableHead>
                          <TableHead>Description</TableHead>
                        </>
                      ) : (
                        <TableHead>Description</TableHead>
                      )}
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id} data-state={excludedIds?.has(tx.id) ? 'selected' : undefined}>
                        {isExcludable && (
                          <TableCell className="text-center">
                            <Checkbox
                              id={`exclude-${tx.id}`}
                              aria-label={`Exclude transaction ${tx.description}`}
                              checked={excludedIds?.has(tx.id)}
                              onCheckedChange={() => onToggleExclude?.(tx.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDate(tx.date)}
                        </TableCell>
                        {isMonthlySummary ? (
                          <>
                            <TableCell className="font-medium">{tx.category}</TableCell>
                            <TableCell className="font-medium">{tx.subCategory || '-'}</TableCell>
                            <TableCell className="font-medium">{tx.description}</TableCell>
                          </>
                        ) : (
                          <TableCell className="font-medium">{tx.description}</TableCell>
                        )}
                        <TableCell
                          className={cn("text-right font-semibold whitespace-nowrap", {
                            "text-green-600": tx.type === 'Income',
                            "text-red-600": tx.type === 'Expense',
                            "text-blue-600": tx.type === 'Investment' || tx.type === 'Transfer',
                          })}
                        >
                          {tx.type === 'Income' ? '+' : tx.type === 'Expense' ? '' : ''}
                          {formatCurrency(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {error && <div className="text-red-600 text-center p-2 text-sm">{error}</div>}
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No transactions found for this period.</p>
              </div>
            )}
            
            {/* Load More Section */}
            {!isLoading && (
              <div className="flex justify-center items-center py-4">
                {isLoadingMore ? (
                  <div className="flex items-center text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Loading more...</span>
                  </div>
                ) : hasMore ? (
                  <Button onClick={onLoadMore} variant="outline" disabled={!onLoadMore}>
                    Load More
                  </Button>
                ) : (
                  transactions.length > 0 && <p className="text-sm text-muted-foreground">No more transactions to load.</p>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
