
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { AlertCircle, Loader2, Edit2, Copy, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Category } from "./add-expense-dialog";

interface Transaction {
  id: string;
  date: string | null;
  description: string;
  amount: number;
  type: 'Income' | 'Expense' | 'Investment' | 'Transfer' | 'Other';
  category?: string;
  subCategory?: string;
  accountId?: string;
  accountName?: string;
  categoryId?: string;
  subCategoryId?: string;
  investmentAccountId?: string;
  investmentAccountName?: string;
  capId?: string;
  rewards?: number;
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
  categories?: Category[];
  categoryFilter?: string;
  onCategoryFilterChange?: (value: string) => void;
  includeSplitwise?: boolean;
  onIncludeSplitwiseChange?: (value: boolean) => void;
  entityType?: 'bank' | 'credit-card' | null;
  // Action callbacks for edit, duplicate, delete
  onEdit?: (transaction: Transaction) => void;
  onDuplicate?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  isDeleting?: boolean;
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
  categories,
  categoryFilter,
  onCategoryFilterChange,
  includeSplitwise,
  onIncludeSplitwiseChange,
  entityType,
  onEdit,
  onDuplicate,
  onDelete,
  isDeleting = false,
}: TransactionDialogProps) {

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [transactionToDelete, setTransactionToDelete] = React.useState<Transaction | null>(null);

  const hasActions = !!(onEdit || onDuplicate || onDelete);

  const handleDeleteClick = (tx: Transaction) => {
    setTransactionToDelete(tx);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (transactionToDelete && onDelete) {
      onDelete(transactionToDelete);
    }
    setDeleteConfirmOpen(false);
    setTransactionToDelete(null);
  };

  const isMonthlySummary = React.useMemo(() =>
    transactions.length > 0 && transactions.some(tx => tx.category),
    [transactions]
  );
  
  const showCategoryFilter = isExcludable && categories && categories.length > 0 && categoryFilter !== undefined && onCategoryFilterChange;

  // Filter transactions based on includeSplitwise toggle
  const filteredTransactions = React.useMemo(() => {
    if (includeSplitwise === false) {
      // Filter out splitwise transactions (those with IDs starting with "splitwise-")
      return transactions.filter(tx => !tx.id.startsWith('splitwise-'));
    }
    return transactions;
  }, [transactions, includeSplitwise]);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>      <DialogContent className="sm:max-w-[1200px] h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>{title || "Transactions"}</DialogTitle>
            <div className="flex items-center gap-2">
                {onIncludeSplitwiseChange !== undefined && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="include-splitwise"
                      checked={includeSplitwise}
                      onCheckedChange={onIncludeSplitwiseChange}
                    />
                    <Label htmlFor="include-splitwise" className="text-sm cursor-pointer">
                      Include Splitwise
                    </Label>
                  </div>
                )}
                {showCategoryFilter && (
                   <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
                     <SelectTrigger className="w-[180px]">
                       <SelectValue placeholder="Filter by category" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.name}>
                            {cat.name}
                          </SelectItem>
                        ))}
                     </SelectContent>
                   </Select>
                )}
                {isExcludable && excludedIds && excludedIds.size > 0 && onClearExclusions && (
                  <Button variant="outline" size="sm" onClick={onClearExclusions}>
                    Clear Selection ({excludedIds.size})
                  </Button>
                )}
            </div>
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
            ) : error && filteredTransactions.length === 0 ? (
              <div className="text-red-600 flex items-center justify-center p-4 bg-red-50 rounded-md my-4">
                <AlertCircle className="h-5 w-5 mr-2" />
                Error loading transactions: {error}
              </div>
            ) : filteredTransactions.length > 0 ? (
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
                      {entityType === 'credit-card' && <TableHead className="text-right">Rewards</TableHead>}
                      {hasActions && <TableHead className="text-center">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
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
                        {entityType === 'credit-card' && (
                          <TableCell className="text-right text-amber-600 font-medium whitespace-nowrap">
                            {tx.rewards != null && tx.rewards > 0 ? formatCurrency(tx.rewards) : '-'}
                          </TableCell>
                        )}
                        {hasActions && (
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              {onEdit && tx.type !== 'Other' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => onEdit(tx)}
                                  title="Edit"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                              {onDuplicate && tx.type !== 'Other' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => onDuplicate(tx)}
                                  title="Duplicate"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              )}
                              {onDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteClick(tx)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
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
                  filteredTransactions.length > 0 && <p className="text-sm text-muted-foreground">No more transactions to load.</p>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the transaction
            {transactionToDelete ? ` "${transactionToDelete.description}"` : ''}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}