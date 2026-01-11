"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

export interface UnauditedExpenseCategory {
  id: string;
  name: string;
}

export interface UnauditedExpenseSubCategory {
  id: string;
  name: string;
  categoryId: string;
}

interface UnauditedExpenseTransaction {
  id: string;
  date: string | null;
  amount: number;
  accountName?: string;

  // Editable fields
  description: string;
  categoryId?: string;
  subCategoryId?: string;

  // Display helpers
  category?: string;
  subCategory?: string;
}

interface UnauditedExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseCategories: UnauditedExpenseCategory[];
  expenseSubCategories: UnauditedExpenseSubCategory[];
}

export function UnauditedExpenseDialog({
  open,
  onOpenChange,
  expenseCategories,
  expenseSubCategories,
}: UnauditedExpenseDialogProps) {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<UnauditedExpenseTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;

    const fetchUnaudited = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/unaudited-expenses");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Failed to fetch unaudited expenses");
        }

        setTransactions((data?.transactions || []) as UnauditedExpenseTransaction[]);
        setSelectedIds({});
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        toast({
          variant: "destructive",
          title: "Error",
          description: message,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUnaudited();
  }, [open, toast]);

  const subCategoriesByCategoryId = useMemo(() => {
    const map = new Map<string, UnauditedExpenseSubCategory[]>();
    for (const sub of expenseSubCategories) {
      const list = map.get(sub.categoryId) || [];
      list.push(sub);
      map.set(sub.categoryId, list);
    }
    return map;
  }, [expenseSubCategories]);

  const totalCount = transactions.length;
  const selectedCount = useMemo(
    () => Object.values(selectedIds).filter(Boolean).length,
    [selectedIds]
  );
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  const selectedTransactions = useMemo(() => {
    const selected = new Set(Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k));
    return transactions.filter((t) => selected.has(t.id));
  }, [selectedIds, transactions]);

  const updateTx = (id: string, patch: Partial<UnauditedExpenseTransaction>) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds({});
      return;
    }

    const next: Record<string, boolean> = {};
    for (const tx of transactions) {
      next[tx.id] = true;
    }
    setSelectedIds(next);
  };

  const handleBulkUpdate = async () => {
    if (selectedTransactions.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing selected",
        description: "Select at least one transaction to update.",
      });
      return;
    }

    const missingCategory = selectedTransactions.find((t) => !t.categoryId);
    if (missingCategory) {
      toast({
        variant: "destructive",
        title: "Missing category",
        description: "All selected rows must have a category.",
      });
      return;
    }

    setIsBulkSaving(true);
    try {
      const res = await fetch("/api/unaudited-expenses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: selectedTransactions.map((t) => ({
            id: t.id,
            categoryId: t.categoryId,
            subCategoryId: t.subCategoryId,
            description: t.description,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update transactions");
      }

      const updatedIds = new Set<string>(
        Array.isArray(data?.updatedIds)
          ? (data.updatedIds as string[])
          : selectedTransactions.map((t) => t.id)
      );

      setTransactions((prev) => prev.filter((t) => !updatedIds.has(t.id)));
      setSelectedIds({});

      toast({
        title: "Updated",
        description: "Selected transactions updated successfully.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        variant: "destructive",
        title: "Update failed",
        description: message,
      });
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTransactions.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing selected",
        description: "Select at least one transaction to delete.",
      });
      return;
    }

    setIsBulkDeleting(true);
    try {
      const ids = selectedTransactions.map((t) => t.id);
      const res = await fetch("/api/unaudited-expenses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete transactions");
      }

      const deletedIds = new Set<string>(
        Array.isArray(data?.deletedIds) ? (data.deletedIds as string[]) : ids
      );

      setTransactions((prev) => prev.filter((t) => !deletedIds.has(t.id)));
      setSelectedIds({});
      toast({
        title: "Deleted",
        description: "Selected transactions deleted successfully.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: message,
      });
    } finally {
      setIsBulkDeleting(false);
      setIsDeleteConfirmOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Unaudited Expense</DialogTitle>
          <DialogDescription>
            Expense transactions with no mapped category. Update category, subcategory, and description.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Selected: {selectedCount} / {totalCount}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleBulkUpdate} disabled={isBulkSaving || isLoading || selectedCount === 0}>
              {isBulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Selected"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setIsDeleteConfirmOpen(true)}
              disabled={isBulkDeleting || isLoading || selectedCount === 0}
            >
              {isBulkDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected
                </>
              )}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : totalCount === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No unaudited expense transactions found.
          </div>
        ) : (
          <ScrollArea className="h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[120px]">Amount</TableHead>
                  <TableHead className="w-[180px]">Account</TableHead>
                  <TableHead className="w-[220px]">Category</TableHead>
                  <TableHead className="w-[220px]">Subcategory</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const categoryValue = tx.categoryId && tx.categoryId.length > 0 ? tx.categoryId : undefined;
                  const subCategoryValue = tx.subCategoryId && tx.subCategoryId.length > 0 ? tx.subCategoryId : undefined;
                  const availableSubCategories = categoryValue
                    ? subCategoriesByCategoryId.get(categoryValue) || []
                    : [];

                  return (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(selectedIds[tx.id])}
                          onCheckedChange={(v) =>
                            setSelectedIds((prev) => ({
                              ...prev,
                              [tx.id]: Boolean(v),
                            }))
                          }
                          aria-label={`Select ${tx.id}`}
                        />
                      </TableCell>
                      <TableCell>{tx.date || "-"}</TableCell>
                      <TableCell>{tx.amount}</TableCell>
                      <TableCell>{tx.accountName || "-"}</TableCell>
                      <TableCell>
                        <Select
                          value={categoryValue}
                          onValueChange={(v) => {
                            updateTx(tx.id, {
                              categoryId: v,
                              subCategoryId: undefined,
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {expenseCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={subCategoryValue}
                          onValueChange={(v) => updateTx(tx.id, { subCategoryId: v })}
                          disabled={!categoryValue}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={categoryValue ? "Select subcategory" : "Select category first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableSubCategories.map((sc) => (
                              <SelectItem key={sc.id} value={sc.id}>
                                {sc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={tx.description || ""}
                          onChange={(e) => updateTx(tx.id, { description: e.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete selected transactions?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the selected transactions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} disabled={isBulkDeleting}>
                {isBulkDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
