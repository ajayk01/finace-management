"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Loader2, Edit2, Trash2, Copy, Eye, Users } from 'lucide-react';
import { format, parse } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { AddExpenseDialog } from '@/components/dashboard/add-expense-dialog';
import { AddIncomeDialog } from '@/components/dashboard/add-income-dialog';
import { AddInvestmentDialog } from '@/components/dashboard/add-investment-dialog';
import { ViewTransactionDetailsDialog } from '@/components/dashboard/view-transaction-details-dialog';

interface Transaction {
  id: string;
  date: string | null;
  time?: string;
  description: string;
  amount: number;
  type: 'Income' | 'Expense' | 'Investment' | 'Transfer' | 'Splitwise Settlement';
  category?: string;
  subCategory?: string;
  accountId?: string;
  accountName?: string;
  categoryId?: string;
  subCategoryId?: string;
  investmentAccountId?: string;
  investmentAccountName?: string;
  splitwiseGroupId?: string;
  splitwiseGroupName?: string;
  splitwiseUserIds?: string[];
  splitType?: 'equal' | 'custom';
  customAmounts?: Record<string, number>;
  capId?: string;
  splitwiseDetails?: {
    splitwiseTransactionId: string;
    friendId: string;
    friendName: string;
    splitwiseFriendId: string;
    splitAmount: number;
  }[];
}

interface Category {
  id: string;
  name: string;
}

interface SubCategory {
  id: string;
  name: string;
  categoryId: string;
}

interface Account {
  id: string;
  name: string;
  type: 'Bank' | 'Credit Card';
  balance?: number;
  usedAmount?: number;
  totalLimit?: number;
}

export default function TransactionsPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Data state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [expenseSubCategories, setExpenseSubCategories] = useState<SubCategory[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [incomeSubCategories, setIncomeSubCategories] = useState<SubCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<Account[]>([]);
  const [investmentAccounts, setInvestmentAccounts] = useState<{ id: string; name: string }[]>([]);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<'All' | 'Income' | 'Expense' | 'Investment' | 'Transfer' | 'Splitwise Settlement'>('All');
  const [accountFilter, setAccountFilter] = useState<string>('All');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const monthMap = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return monthMap[new Date().getMonth()];
  });
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Delete state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // View details state
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [viewDetailsTransaction, setViewDetailsTransaction] = useState<Transaction | null>(null);

  // Edit dialog state (fallback)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDuplicatePreviewOpen, setIsDuplicatePreviewOpen] = useState(false);

  // Expense edit/duplicate state
  const [isExpenseEditDialogOpen, setIsExpenseEditDialogOpen] = useState(false);
  const [editingExpenseData, setEditingExpenseData] = useState<Transaction | null>(null);
  const [isDuplicatingExpense, setIsDuplicatingExpense] = useState(false);
  const [duplicatingExpenseData, setDuplicatingExpenseData] = useState<Transaction | null>(null);

  // Income edit/duplicate state
  const [isIncomeEditDialogOpen, setIsIncomeEditDialogOpen] = useState(false);
  const [editingIncomeData, setEditingIncomeData] = useState<Transaction | null>(null);
  const [isDuplicatingIncome, setIsDuplicatingIncome] = useState(false);
  const [duplicatingIncomeData, setDuplicatingIncomeData] = useState<Transaction | null>(null);

  // Investment edit/duplicate state
  const [isInvestmentEditDialogOpen, setIsInvestmentEditDialogOpen] = useState(false);
  const [editingInvestmentData, setEditingInvestmentData] = useState<Transaction | null>(null);
  const [isDuplicatingInvestment, setIsDuplicatingInvestment] = useState(false);
  const [duplicatingInvestmentData, setDuplicatingInvestmentData] = useState<Transaction | null>(null);

  const combinedAccounts = [
    ...bankAccounts.map(acc => ({ ...acc, type: "Bank" as const })),
    ...creditCards.map(card => ({ ...card, type: "Credit Card" as const }))
  ];

  const filteredTransactions = transactions
    .filter(tx => typeFilter === 'All' || tx.type === typeFilter)
    .filter(tx => accountFilter === 'All' || tx.accountId === accountFilter);

  // --- Data Fetching ---
  useEffect(() => {
    fetchTransactions();
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchReferenceData();
  }, []);

  const fetchReferenceData = async () => {
    await Promise.all([
      fetchCategories(),
      fetchBankDetails(),
      fetchCreditCardDetails(),
      fetchInvestmentAccounts(),
    ]);
  };

  const fetchCategories = async () => {
    try {
      const [expRes, incRes] = await Promise.all([
        fetch('/api/categories?type=expense'),
        fetch('/api/categories?type=income'),
      ]);
      const expData = await expRes.json();
      const incData = await incRes.json();
      if (expRes.ok) {
        setExpenseCategories(expData.categories || []);
        setExpenseSubCategories(expData.subCategories || []);
      }
      if (incRes.ok) {
        setIncomeCategories(incData.categories || []);
        setIncomeSubCategories(incData.subCategories || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchBankDetails = async () => {
    try {
      const res = await fetch('/api/bank-details');
      if (res.ok) {
        const data = await res.json();
        setBankAccounts((data.bankAccounts || []).map((acc: any) => ({
          id: acc.id,
          name: acc.name,
          type: 'Bank' as const,
          balance: acc.balance,
        })));
      }
    } catch (error) {
      console.error('Error fetching bank details:', error);
    }
  };

  const fetchCreditCardDetails = async () => {
    try {
      const res = await fetch('/api/credit-card-details');
      if (res.ok) {
        const data = await res.json();
        setCreditCards((data.creditCardDetails || []).map((card: any) => ({
          id: card.id,
          name: card.name,
          type: 'Credit Card' as const,
          usedAmount: card.usedAmount,
          totalLimit: card.totalLimit,
        })));
      }
    } catch (error) {
      console.error('Error fetching credit card details:', error);
    }
  };

  const fetchInvestmentAccounts = async () => {
    try {
      const res = await fetch('/api/investment-accounts');
      const data = await res.json();
      if (res.ok) {
        setInvestmentAccounts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching investment accounts:', error);
    }
  };

  const fetchTransactions = async () => {
    setIsLoading(true);
    setSelectedIds(new Set());
    try {
      const res = await fetch(`/api/all-transactions?month=${selectedMonth}&year=${selectedYear}`);
      const data = await res.json();
      if (res.ok) {
        setTransactions(data.transactions || []);
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to fetch transactions" });
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast({ variant: "destructive", title: "Error", description: "An error occurred while fetching transactions" });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Selection ---
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredTransactions.map(tx => tx.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  // --- Bulk Delete ---
  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/all-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-delete', ids: Array.from(selectedIds).map(Number) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Success", description: data.message || `${selectedIds.size} transaction(s) deleted` });
        setSelectedIds(new Set());
        fetchTransactions();
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to delete transactions" });
      }
    } catch (error) {
      console.error("Error bulk deleting transactions:", error);
      toast({ variant: "destructive", title: "Error", description: "An error occurred while deleting transactions" });
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteConfirmOpen(false);
    }
  };

  // --- Single Delete ---
  const handleDeleteClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTransaction) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/all-transactions?id=${selectedTransaction.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Success", description: "Transaction deleted successfully" });
        fetchTransactions();
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to delete transaction" });
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast({ variant: "destructive", title: "Error", description: "An error occurred while deleting transaction" });
    } finally {
      setIsSaving(false);
      setDeleteConfirmOpen(false);
      setSelectedTransaction(null);
    }
  };

  // --- Edit ---
  const handleEdit = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    if (transaction.type === 'Expense') {
      setEditingExpenseData(transaction);
      setIsExpenseEditDialogOpen(true);
    } else if (transaction.type === 'Income') {
      setEditingIncomeData(transaction);
      setIsIncomeEditDialogOpen(true);
    } else if (transaction.type === 'Investment') {
      setEditingInvestmentData(transaction);
      setIsInvestmentEditDialogOpen(true);
    } else {
      setIsEditDialogOpen(true);
    }
  };

  // --- Duplicate ---
  const handleDuplicate = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    if (transaction.type === 'Expense') {
      setDuplicatingExpenseData(transaction);
      setIsDuplicatingExpense(true);
    } else if (transaction.type === 'Income') {
      setDuplicatingIncomeData(transaction);
      setIsDuplicatingIncome(true);
    } else if (transaction.type === 'Investment') {
      setDuplicatingInvestmentData(transaction);
      setIsDuplicatingInvestment(true);
    } else {
      setIsDuplicatePreviewOpen(true);
    }
  };

  // --- Update Handlers ---
  const handleExpenseUpdated = async () => {
    await fetchTransactions();
    setIsExpenseEditDialogOpen(false);
    setEditingExpenseData(null);
    setIsDuplicatingExpense(false);
    setDuplicatingExpenseData(null);
    toast({ title: "Success", description: isDuplicatingExpense ? "Expense duplicated successfully" : "Expense updated successfully" });
  };

  const handleIncomeUpdated = async () => {
    await fetchTransactions();
    setIsIncomeEditDialogOpen(false);
    setEditingIncomeData(null);
    setIsDuplicatingIncome(false);
    setDuplicatingIncomeData(null);
    toast({ title: "Success", description: isDuplicatingIncome ? "Income duplicated successfully" : "Income updated successfully" });
  };

  const handleInvestmentUpdated = async () => {
    await fetchTransactions();
    setIsInvestmentEditDialogOpen(false);
    setEditingInvestmentData(null);
    setIsDuplicatingInvestment(false);
    setDuplicatingInvestmentData(null);
    toast({ title: "Success", description: isDuplicatingInvestment ? "Investment duplicated successfully" : "Investment updated successfully" });
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'Income': return 'default';
      case 'Expense': return 'destructive';
      case 'Investment': return 'secondary';
      case 'Splitwise Settlement': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold md:text-2xl">All Transactions</h1>
      </header>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="w-[180px]">
            <label className="text-sm font-medium mb-2 block">Month</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jan">January</SelectItem>
                <SelectItem value="feb">February</SelectItem>
                <SelectItem value="mar">March</SelectItem>
                <SelectItem value="apr">April</SelectItem>
                <SelectItem value="may">May</SelectItem>
                <SelectItem value="jun">June</SelectItem>
                <SelectItem value="jul">July</SelectItem>
                <SelectItem value="aug">August</SelectItem>
                <SelectItem value="sep">September</SelectItem>
                <SelectItem value="oct">October</SelectItem>
                <SelectItem value="nov">November</SelectItem>
                <SelectItem value="dec">December</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[140px]">
            <label className="text-sm font-medium mb-2 block">Year</label>
            <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <label className="text-sm font-medium mb-2 block">Type</label>
            <Select value={typeFilter} onValueChange={(val) => setTypeFilter(val as typeof typeFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Types</SelectItem>
                <SelectItem value="Income">Income</SelectItem>
                <SelectItem value="Expense">Expense</SelectItem>
                <SelectItem value="Investment">Investment</SelectItem>
                <SelectItem value="Transfer">Transfer</SelectItem>
                <SelectItem value="Splitwise Settlement">Splitwise Settlement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px]">
            <label className="text-sm font-medium mb-2 block">Account</label>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Accounts</SelectItem>
                {bankAccounts.length > 0 && (
                  <>
                    <SelectItem value="__bank_header" disabled className="font-semibold text-xs text-muted-foreground">
                      — Bank Accounts —
                    </SelectItem>
                    {bankAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                  </>
                )}
                {creditCards.length > 0 && (
                  <>
                    <SelectItem value="__cc_header" disabled className="font-semibold text-xs text-muted-foreground">
                      — Credit Cards —
                    </SelectItem>
                    {creditCards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteConfirmOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Bulk Delete
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </Button>
          </div>
        )}

        {/* Transactions Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">No transactions found for this month.</p>
          </div>
        ) : (
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredTransactions.length > 0 && filteredTransactions.every(tx => selectedIds.has(tx.id))}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Splitwise</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((transaction) => (
                  <TableRow key={transaction.id} className={selectedIds.has(transaction.id) ? 'bg-muted/50' : ''}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selectedIds.has(transaction.id)}
                        onCheckedChange={(checked) => handleSelectOne(transaction.id, !!checked)}
                        aria-label={`Select transaction ${transaction.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{transaction.id}</TableCell>
                    <TableCell className="whitespace-nowrap">{transaction.date || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={getTypeBadgeVariant(transaction.type)}
                        className={transaction.type === 'Income' ? 'bg-green-600 text-white hover:bg-green-600/80' : transaction.type === 'Splitwise Settlement' ? 'bg-orange-600 text-white hover:bg-orange-600/80' : ''}
                      >
                        {transaction.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{transaction.description}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{transaction.category}</span>
                        {transaction.subCategory && (
                          <span className="text-xs text-muted-foreground">{transaction.subCategory}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {transaction.type === 'Investment' ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">From:</span>
                          <span className="font-medium">{transaction.accountName || 'N/A'}</span>
                          <span className="text-xs text-muted-foreground mt-1">To:</span>
                          <span className="font-medium">{transaction.investmentAccountName || 'N/A'}</span>
                        </div>
                      ) : (
                        <span>{transaction.accountName || 'N/A'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ₹{transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      {transaction.splitwiseDetails && transaction.splitwiseDetails.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-orange-500" />
                            <span className="text-xs font-medium text-orange-600">Split</span>
                          </div>
                          {transaction.splitwiseDetails.map((detail, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-muted-foreground truncate max-w-[80px]">{detail.friendName}</span>
                              <span className="font-medium text-orange-600 whitespace-nowrap">₹{detail.splitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => { setViewDetailsTransaction(transaction); setViewDetailsOpen(true); }} title="View Details">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(transaction)} title="Edit">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDuplicate(transaction)} title="Duplicate">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(transaction)} title="Delete" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Dialog (fallback) */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Make changes to this {selectedTransaction?.type.toLowerCase()} transaction.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Duplicate Preview Dialog (fallback) */}
      <Dialog open={isDuplicatePreviewOpen} onOpenChange={setIsDuplicatePreviewOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Duplicate Transaction</DialogTitle>
            <DialogDescription>
              Preview and modify this {selectedTransaction?.type.toLowerCase()} before creating a duplicate.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected transaction{selectedIds.size > 1 ? 's' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteConfirm}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the transaction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AddExpenseDialog for editing */}
      {editingExpenseData && (
        <AddExpenseDialog
          open={isExpenseEditDialogOpen}
          onOpenChange={(open) => { setIsExpenseEditDialogOpen(open); if (!open) setEditingExpenseData(null); }}
          categories={expenseCategories.map(cat => ({ id: cat.id, name: cat.name }))}
          subCategories={expenseSubCategories.map(sub => ({ id: sub.id, name: sub.name, categoryId: sub.categoryId }))}
          accounts={combinedAccounts.map(acc => ({ id: acc.id, name: acc.name, type: acc.type, balance: acc.balance, usedAmount: acc.usedAmount, totalLimit: acc.totalLimit }))}
          onExpenseAdded={handleExpenseUpdated}
          editTransactionId={editingExpenseData.id}
          initialValues={{
            amount: editingExpenseData.amount,
            date: editingExpenseData.date ? parse(editingExpenseData.date, 'yyyy-MM-dd', new Date()) : new Date(),
            time: editingExpenseData.time || format(new Date(), 'HH:mm'),
            description: editingExpenseData.description,
            accountId: editingExpenseData.accountId || '',
            categoryId: editingExpenseData.categoryId || '',
            subCategoryId: editingExpenseData.subCategoryId || '',
            capId: editingExpenseData.capId || undefined,
            includeSplitwise: !!(editingExpenseData.splitwiseDetails && editingExpenseData.splitwiseDetails.length > 0),
            splitwiseGroupId: editingExpenseData.splitwiseGroupId || '',
            splitwiseUserIds: editingExpenseData.splitwiseDetails
              ? editingExpenseData.splitwiseDetails.map(d => d.splitwiseFriendId) : [],
            splitType: editingExpenseData.splitType || 'custom',
            customAmounts: editingExpenseData.splitwiseDetails
              ? Object.fromEntries(editingExpenseData.splitwiseDetails.map(d => [d.splitwiseFriendId, d.splitAmount])) : {},
          }}
        />
      )}

      {/* AddExpenseDialog for duplicating */}
      {duplicatingExpenseData && (
        <AddExpenseDialog
          open={isDuplicatingExpense}
          onOpenChange={(open) => { setIsDuplicatingExpense(open); if (!open) setDuplicatingExpenseData(null); }}
          categories={expenseCategories.map(cat => ({ id: cat.id, name: cat.name }))}
          subCategories={expenseSubCategories.map(sub => ({ id: sub.id, name: sub.name, categoryId: sub.categoryId }))}
          accounts={combinedAccounts.map(acc => ({ id: acc.id, name: acc.name, type: acc.type, balance: acc.balance, usedAmount: acc.usedAmount, totalLimit: acc.totalLimit }))}
          onExpenseAdded={handleExpenseUpdated}
          initialValues={{
            amount: duplicatingExpenseData.amount,
            date: new Date(),
            description: duplicatingExpenseData.description,
            accountId: duplicatingExpenseData.accountId || '',
            categoryId: duplicatingExpenseData.categoryId || '',
            subCategoryId: duplicatingExpenseData.subCategoryId || '',
            includeSplitwise: false,
            splitwiseGroupId: '',
            splitwiseUserIds: [],
            splitType: 'equal',
            customAmounts: {},
          }}
        />
      )}

      {/* AddIncomeDialog for editing */}
      {editingIncomeData && (
        <AddIncomeDialog
          open={isIncomeEditDialogOpen}
          onOpenChange={(open) => { setIsIncomeEditDialogOpen(open); if (!open) setEditingIncomeData(null); }}
          categories={incomeCategories.map(cat => ({ id: cat.id, name: cat.name }))}
          subCategories={incomeSubCategories.map(sub => ({ id: sub.id, name: sub.name, categoryId: sub.categoryId }))}
          accounts={combinedAccounts.map(acc => ({ id: acc.id, name: acc.name, type: acc.type }))}
          onIncomeAdded={handleIncomeUpdated}
          editTransactionId={editingIncomeData.id}
          initialValues={{
            amount: editingIncomeData.amount,
            date: editingIncomeData.date ? parse(editingIncomeData.date, 'yyyy-MM-dd', new Date()) : new Date(),
            time: editingIncomeData.time || format(new Date(), 'HH:mm'),
            description: editingIncomeData.description,
            accountId: editingIncomeData.accountId || '',
            categoryId: editingIncomeData.categoryId || '',
            subCategoryId: editingIncomeData.subCategoryId || '',
          }}
        />
      )}

      {/* AddIncomeDialog for duplicating */}
      {duplicatingIncomeData && (
        <AddIncomeDialog
          open={isDuplicatingIncome}
          onOpenChange={(open) => { setIsDuplicatingIncome(open); if (!open) setDuplicatingIncomeData(null); }}
          categories={incomeCategories.map(cat => ({ id: cat.id, name: cat.name }))}
          subCategories={incomeSubCategories.map(sub => ({ id: sub.id, name: sub.name, categoryId: sub.categoryId }))}
          accounts={combinedAccounts.map(acc => ({ id: acc.id, name: acc.name, type: acc.type }))}
          onIncomeAdded={handleIncomeUpdated}
          initialValues={{
            amount: duplicatingIncomeData.amount,
            date: new Date(),
            description: duplicatingIncomeData.description,
            accountId: duplicatingIncomeData.accountId || '',
            categoryId: duplicatingIncomeData.categoryId || '',
            subCategoryId: duplicatingIncomeData.subCategoryId || '',
          }}
        />
      )}

      {/* AddInvestmentDialog for editing */}
      {editingInvestmentData && (
        <AddInvestmentDialog
          open={isInvestmentEditDialogOpen}
          onOpenChange={(open) => { setIsInvestmentEditDialogOpen(open); if (!open) setEditingInvestmentData(null); }}
          investmentCategories={investmentAccounts.map(acc => ({ id: acc.id, name: acc.name }))}
          accounts={bankAccounts.map(acc => ({ id: acc.id, name: acc.name, type: 'Bank' as const }))}
          onInvestmentAdded={handleInvestmentUpdated}
          editTransactionId={editingInvestmentData.id}
          initialValues={{
            amount: editingInvestmentData.amount,
            date: editingInvestmentData.date ? parse(editingInvestmentData.date, 'yyyy-MM-dd', new Date()) : new Date(),
            time: editingInvestmentData.time || format(new Date(), 'HH:mm'),
            description: editingInvestmentData.description,
            accountId: editingInvestmentData.accountId || '',
            investmentAccountId: editingInvestmentData.investmentAccountId || '',
          }}
        />
      )}

      {/* AddInvestmentDialog for duplicating */}
      {duplicatingInvestmentData && (
        <AddInvestmentDialog
          open={isDuplicatingInvestment}
          onOpenChange={(open) => { setIsDuplicatingInvestment(open); if (!open) setDuplicatingInvestmentData(null); }}
          investmentCategories={investmentAccounts.map(acc => ({ id: acc.id, name: acc.name }))}
          accounts={bankAccounts.map(acc => ({ id: acc.id, name: acc.name, type: 'Bank' as const }))}
          onInvestmentAdded={handleInvestmentUpdated}
          initialValues={{
            amount: duplicatingInvestmentData.amount,
            date: new Date(),
            description: duplicatingInvestmentData.description,
            accountId: duplicatingInvestmentData.accountId || '',
            investmentAccountId: duplicatingInvestmentData.investmentAccountId || '',
          }}
        />
      )}

      {/* View Transaction Details */}
      <ViewTransactionDetailsDialog
        open={viewDetailsOpen}
        onOpenChange={setViewDetailsOpen}
        transaction={viewDetailsTransaction}
      />
    </div>
  );
}
