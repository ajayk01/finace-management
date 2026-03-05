"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  RefreshCcw,
  ArrowLeft,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

// ==================== TYPES ====================

interface FriendBalance {
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
  totalAmount?: number;
  category: string;
  subCategory: string;
  accountId: string;
  splitwiseId?: string;
  friendId?: number;
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

// ==================== HELPERS ====================

const formatCurrency = (amount: number | null) => {
  if (amount === null || typeof amount === "undefined") return "₹ --.--";
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getAmountColor = (
  splitwiseAmount: number | null,
  notionAmount: number | null
) => {
  if (splitwiseAmount === null || notionAmount === null)
    return "text-muted-foreground";
  if (splitwiseAmount !== notionAmount) return "text-red-600";
  return "text-foreground";
};

// ==================== PAGE COMPONENT ====================

export default function SplitwisePage() {
  const router = useRouter();
  const { toast } = useToast();

  // Friends balance state
  const [friendsBalance, setFriendsBalance] = useState<FriendBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settlement view state
  const [selectedFriend, setSelectedFriend] = useState<FriendBalance | null>(
    null
  );
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [unsettledExpenses, setUnsettledExpenses] = useState<
    UnsettledExpense[]
  >([]);
  const [expenseSelections, setExpenseSelections] = useState<
    Record<
      string,
      { categoryId: number | null; subCategoryId: number | null }
    >
  >({});
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);
  const [isFetchingUnsettled, setIsFetchingUnsettled] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Lookup data
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Split transactions dialog state
  const [splitTxDialogOpen, setSplitTxDialogOpen] = useState(false);
  const [splitTxFriend, setSplitTxFriend] = useState<FriendBalance | null>(
    null
  );
  const [splitTxData, setSplitTxData] = useState<Transaction[]>([]);
  const [isFetchingSplitTx, setIsFetchingSplitTx] = useState(false);
  const [selectedSplitTxIds, setSelectedSplitTxIds] = useState<Set<string>>(new Set());
  const [splitTxBankAccount, setSplitTxBankAccount] = useState<string>("");
  const [isSplitTxSettling, setIsSplitTxSettling] = useState(false);

  // Derived
  const categoriesWithSubcategories = (categories || [])
    .filter((cat) => cat.type === 1)
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      budget: cat.budget,
      subcategories: cat.subcategories || [],
    }));

  const filteredData = (friendsBalance || []).filter((friend) => {
    const splitwiseIsEmpty =
      friend.splitwiseAmount === null ||
      friend.splitwiseAmount === undefined ||
      Math.abs(friend.splitwiseAmount || 0) < 0.01;
    const notionIsEmpty =
      friend.notionAmount === null ||
      friend.notionAmount === undefined ||
      Math.abs(friend.notionAmount || 0) < 0.01;

    return !(splitwiseIsEmpty && notionIsEmpty);
  });

  // ==================== DATA FETCHING ====================

  const fetchFriendsBalance = useCallback(
    async (forceRefresh: boolean = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const url = forceRefresh
          ? "/api/friends-balance?refresh=true"
          : "/api/friends-balance";
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch friends balance");
        const data = await res.json();
        setFriendsBalance(data.friends || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const fetchBankAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/bank-details");
      if (!res.ok) throw new Error("Failed to fetch bank accounts");
      const data = await res.json();
      setBankAccounts(
        (data.bankAccounts || []).map((acc: any) => ({
          id: acc.id,
          name: acc.name,
        }))
      );
    } catch (err) {
      console.error("Error fetching bank accounts:", err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories?type=expense");
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data = await res.json();
      const cats = (data.categories || []).map((cat: any) => ({
        ...cat,
        type: 1, // Expense type
        subcategories: (data.subCategories || [])
          .filter((sub: any) => sub.categoryId === cat.id)
          .map((sub: any) => ({
            id: sub.id,
            name: sub.name,
            budget: sub.budget || 0,
          })),
      }));
      setCategories(cats);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  }, []);

  useEffect(() => {
    fetchFriendsBalance();
    fetchBankAccounts();
    fetchCategories();
  }, [fetchFriendsBalance, fetchBankAccounts, fetchCategories]);

  // ==================== FRIEND TRANSACTION FETCHING ====================

  const fetchFriendTransactions = async (
    friendId: number,
    friendName: string
  ) => {
    setIsFetchingTransactions(true);
    try {
      const response = await fetch(
        `/api/friend-transactions?friendId=${friendId}&friendName=${encodeURIComponent(friendName)}`
      );
      if (!response.ok) throw new Error("Failed to fetch transactions");
      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      toast({
        title: "Error",
        description: "Failed to fetch friend transactions.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingTransactions(false);
    }
  };

  const fetchUnsettledExpenses = async (friendId: number) => {
    setIsFetchingUnsettled(true);
    try {
      const response = await fetch(
        `/api/unsettled-splitwise-expenses?friendId=${friendId}`
      );
      if (!response.ok) throw new Error("Failed to fetch unsettled expenses");
      const data = await response.json();
      setUnsettledExpenses(data.expenses || []);

      const initialSelections: Record<
        string,
        { categoryId: number | null; subCategoryId: number | null }
      > = {};
      data.expenses.forEach((exp: UnsettledExpense) => {
        initialSelections[exp.splitwiseTransactionId] = {
          categoryId: exp.categoryId,
          subCategoryId: exp.subCategoryId,
        };
      });
      setExpenseSelections(initialSelections);
    } catch (err) {
      console.error("Error fetching unsettled expenses:", err);
      toast({
        title: "Error",
        description: "Failed to fetch unsettled expenses.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingUnsettled(false);
    }
  };

  // ==================== SPLIT TRANSACTIONS (NEW) ====================

  const handleViewSplitTransactions = async (friend: FriendBalance) => {
    if (!friend.friendId) return;
    setSplitTxFriend(friend);
    setSplitTxDialogOpen(true);
    setSelectedSplitTxIds(new Set());
    setSplitTxBankAccount("");
    setIsFetchingSplitTx(true);
    try {
      const response = await fetch(
        `/api/friend-transactions?friendId=${friend.friendId}&friendName=${encodeURIComponent(friend.name)}`
      );
      if (!response.ok)
        throw new Error("Failed to fetch split transactions");
      const data = await response.json();
      setSplitTxData(data.transactions || []);
    } catch (err) {
      console.error("Error fetching split transactions:", err);
      toast({
        title: "Error",
        description: "Failed to fetch split transactions.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingSplitTx(false);
    }
  };

  const toggleSplitTxSelection = (txId: string) => {
    setSelectedSplitTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const toggleAllSplitTx = () => {
    if (selectedSplitTxIds.size === splitTxData.length) {
      setSelectedSplitTxIds(new Set());
    } else {
      setSelectedSplitTxIds(new Set(splitTxData.map((tx) => tx.id)));
    }
  };

  const handleSplitTxSettleUp = async () => {
    if (!splitTxFriend?.friendId || !splitTxBankAccount) {
      toast({
        title: "Missing Information",
        description: "Please select a bank account to settle up.",
        variant: "destructive",
      });
      return;
    }

    setIsSplitTxSettling(true);
    try {
      // If none selected, settle all; otherwise settle only selected
      const idsToSettle =
        selectedSplitTxIds.size > 0
          ? Array.from(selectedSplitTxIds)
          : splitTxData.map((tx) => tx.id);

      const payload = {
        friendId: splitTxFriend.friendId,
        bankAccountId: splitTxBankAccount,
        unsettledExpenses: [],
        settledTransactionIds: idsToSettle,
      };

      const response = await fetch("/api/settle-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to settle transactions");
      const data = await response.json();

      toast({ title: "Settlement Created", description: data.message });

      // Remove settled transactions from the list
      const settledSet = new Set(idsToSettle);
      setSplitTxData((prev) => prev.filter((tx) => !settledSet.has(tx.id)));
      setSelectedSplitTxIds(new Set());

      // Refresh friends balance
      fetchFriendsBalance(true);

      // Close dialog if all settled
      if (idsToSettle.length === splitTxData.length) {
        setSplitTxDialogOpen(false);
      }
    } catch (err) {
      console.error("Error settling split transactions:", err);
      toast({
        title: "Error",
        description: "Failed to settle transactions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSplitTxSettling(false);
    }
  };

  // ==================== SETTLEMENT HANDLERS ====================

  const handleSettleUp = (friend: FriendBalance) => {
    if (!friend.friendId) {
      toast({
        title: "Friend ID Missing",
        description: "Cannot settle up: Friend database ID is missing.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFriend(friend);
    fetchFriendTransactions(friend.friendId, friend.name);
    fetchUnsettledExpenses(friend.friendId);
  };

  const handleBackToList = () => {
    setSelectedFriend(null);
    setSelectedBankAccount("");
    setTransactions([]);
    setUnsettledExpenses([]);
    setExpenseSelections({});
  };

  const handleCategoryChange = (
    splitwiseTransactionId: string,
    categoryId: number
  ) => {
    setExpenseSelections((prev) => ({
      ...prev,
      [splitwiseTransactionId]: {
        categoryId,
        subCategoryId: null,
      },
    }));
  };

  const handleSubCategoryChange = (
    splitwiseTransactionId: string,
    subCategoryId: number
  ) => {
    setExpenseSelections((prev) => ({
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
        title: "Missing Information",
        description: "Please select a bank account.",
        variant: "destructive",
      });
      return;
    }

    if (unsettledExpenses.length > 0) {
      const missingSelections = unsettledExpenses.filter(
        (exp) =>
          !expenseSelections[exp.splitwiseTransactionId]?.categoryId
      );

      if (missingSelections.length > 0) {
        toast({
          title: "Missing Category Selection",
          description:
            "Please select a category for all unsettled expenses.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSettling(true);
    try {
      const payload = {
        friendId: selectedFriend.friendId,
        bankAccountId: selectedBankAccount,
        unsettledExpenses: unsettledExpenses.map((exp) => ({
          splitwiseTransactionId: exp.splitwiseTransactionId,
          date: exp.date,
          description: exp.description,
          splitedAmount: exp.splitedAmount,
          categoryId:
            expenseSelections[exp.splitwiseTransactionId]?.categoryId,
          subCategoryId:
            expenseSelections[exp.splitwiseTransactionId]?.subCategoryId,
        })),
      };

      const response = await fetch("/api/settle-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to create settlement");
      const data = await response.json();

      toast({ title: "Settlement Created", description: data.message });
      handleBackToList();
      fetchFriendsBalance(true);
    } catch (err) {
      console.error("Error creating settlement:", err);
      toast({
        title: "Error",
        description: "Failed to create settlement entries.",
        variant: "destructive",
      });
    } finally {
      setIsSettling(false);
    }
  };

  const handleSyncSplitwise = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/splitwise-sync");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to sync Splitwise data"
        );
      }
      const data = await response.json();
      await fetchFriendsBalance(true);
      toast({
        title: "Sync Complete",
        description: `Successfully synced ${data.notificationsCount} notification(s) from Splitwise.`,
      });
    } catch (err) {
      console.error("Error syncing Splitwise:", err);
      toast({
        title: "Sync Failed",
        description: "Failed to sync Splitwise data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== RENDER ====================

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b bg-background px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (selectedFriend) {
                  handleBackToList();
                } else {
                  router.push("/");
                }
              }}
              className="flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              {selectedFriend ? "Back" : "Dashboard"}
            </Button>
            <div>
              <h1 className="text-xl font-bold">
                {selectedFriend
                  ? `Settle Up with ${selectedFriend.name}`
                  : "Splitwise Balance Summary"}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedFriend
                  ? "Select bank account and categories for unsettled expenses."
                  : "Comparison of balances from Splitwise and Notion."}
              </p>
            </div>
          </div>
          {!selectedFriend && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncSplitwise}
                disabled={isLoading}
                className="flex items-center gap-2 border-green-600 text-green-600 hover:bg-green-50"
              >
                <RefreshCcw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                Sync Splitwise
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchFriendsBalance(true)}
                disabled={isLoading}
                className="flex items-center gap-2 border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!selectedFriend ? (
          // ==================== FRIENDS LIST VIEW ====================
          <>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4 p-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/4" />
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
                    <TableHead className="font-bold text-base w-1/4">
                      Friend
                    </TableHead>
                    <TableHead className="text-right font-bold text-base">
                      Splitwise
                    </TableHead>
                    <TableHead className="text-right font-bold text-base">
                      Notion
                    </TableHead>
                    <TableHead className="text-right font-bold text-base w-1/3">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((friend) => {
                    const splitwise = friend.splitwiseAmount || 0;
                    const notion = friend.notionAmount || 0;
                    const isMatched = Math.abs(splitwise - notion) < 0.01;
                    return (
                      <TableRow
                        key={friend.name}
                        className={cn(
                          "py-3 transition-colors",
                          isMatched
                            ? "hover:bg-slate-50"
                            : "bg-red-50 hover:bg-red-100"
                        )}
                      >
                        <TableCell className="font-medium text-base py-3">
                          {friend.name}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold py-3",
                            getAmountColor(
                              friend.splitwiseAmount,
                              friend.notionAmount
                            )
                          )}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {friend.splitwiseAmount !== null &&
                              friend.splitwiseAmount > 0 && (
                                <ArrowUp className="h-4 w-4 text-green-600" />
                              )}
                            {friend.splitwiseAmount !== null &&
                              friend.splitwiseAmount < 0 && (
                                <ArrowDown className="h-4 w-4 text-red-600" />
                              )}
                            <span className="text-base">
                              {formatCurrency(friend.splitwiseAmount)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold py-3",
                            getAmountColor(
                              friend.splitwiseAmount,
                              friend.notionAmount
                            )
                          )}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {friend.notionAmount !== null &&
                              friend.notionAmount > 0 && (
                                <ArrowUp className="h-4 w-4 text-green-600" />
                              )}
                            {friend.notionAmount !== null &&
                              friend.notionAmount < 0 && (
                                <ArrowDown className="h-4 w-4 text-red-600" />
                              )}
                            <span className="text-base">
                              {formatCurrency(friend.notionAmount)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleViewSplitTransactions(friend)
                              }
                              disabled={!friend.friendId}
                              className="px-3 py-1 h-8"
                            >
                              <List className="h-4 w-4 mr-1" />
                              Splited Transactions
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleSettleUp(friend)}
                              disabled={!friend.friendId}
                              className="px-4 py-1 h-8 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              Settle Up
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex items-center justify-center py-20">
                <p className="text-muted-foreground">
                  No friend balances to display.
                </p>
              </div>
            )}
          </>
        ) : (
          // ==================== SETTLEMENT VIEW ====================
          <div className="space-y-6">
            {/* Bank Account Selection */}
            <div className="space-y-2 max-w-md">
              <label className="text-sm font-medium">
                Select Bank Account *
              </label>
              <Select
                value={selectedBankAccount}
                onValueChange={setSelectedBankAccount}
              >
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
                    {isFetchingUnsettled && (
                      <span className="text-sm text-gray-500 ml-2">
                        (Loading...)
                      </span>
                    )}
                  </h3>
                  <div className="text-sm text-gray-600">
                    Total: ₹
                    {unsettledExpenses
                      .reduce(
                        (sum, exp) => sum + (Number(exp.splitedAmount) || 0),
                        0
                      )
                      .toFixed(2)}
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto border rounded-md p-4 space-y-4 bg-orange-50">
                  {unsettledExpenses.map((expense, index) => {
                    const selectedCategoryId =
                      expenseSelections[expense.splitwiseTransactionId]
                        ?.categoryId;
                    const selectedCategory = selectedCategoryId
                      ? categoriesWithSubcategories.find(
                          (cat) =>
                            cat.id.toString() ===
                            selectedCategoryId.toString()
                        )
                      : null;

                    return (
                      <Card
                        key={
                          expense.splitwiseTransactionId ||
                          `expense-${index}`
                        }
                        className="bg-white"
                      >
                        <CardContent className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600">
                                  Date:
                                </span>
                                <span className="text-sm">
                                  {expense.date
                                    ? new Date(
                                        expense.date
                                      ).toLocaleDateString()
                                    : "N/A"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600">
                                  Description:
                                </span>
                                <span className="text-sm">
                                  {expense.description}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600">
                                  Your Share:
                                </span>
                                <span className="text-sm font-semibold">
                                  ₹
                                  {(
                                    Number(expense.splitedAmount) || 0
                                  ).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div>
                                <label className="text-sm font-medium">
                                  Expense Category *
                                </label>
                                <Select
                                  value={
                                    expenseSelections[
                                      expense.splitwiseTransactionId
                                    ]?.categoryId?.toString() || ""
                                  }
                                  onValueChange={(value) =>
                                    handleCategoryChange(
                                      expense.splitwiseTransactionId,
                                      parseInt(value)
                                    )
                                  }
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categoriesWithSubcategories
                                      .filter((cat) => cat?.id)
                                      .map((category) => (
                                        <SelectItem
                                          key={category.id}
                                          value={category.id.toString()}
                                        >
                                          {category.name}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {selectedCategory &&
                                selectedCategory.subcategories.length > 0 && (
                                  <div>
                                    <label className="text-sm font-medium">
                                      Sub Category
                                    </label>
                                    <Select
                                      value={
                                        expenseSelections[
                                          expense.splitwiseTransactionId
                                        ]?.subCategoryId?.toString() || ""
                                      }
                                      onValueChange={(value) =>
                                        handleSubCategoryChange(
                                          expense.splitwiseTransactionId,
                                          parseInt(value)
                                        )
                                      }
                                    >
                                      <SelectTrigger className="mt-1">
                                        <SelectValue placeholder="Select sub category" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {selectedCategory.subcategories.map(
                                          (subcat) => (
                                            <SelectItem
                                              key={subcat.id}
                                              value={subcat.id.toString()}
                                            >
                                              {subcat.name}
                                            </SelectItem>
                                          )
                                        )}
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
                    {isFetchingTransactions && (
                      <span className="text-sm text-gray-500 ml-2">
                        (Loading...)
                      </span>
                    )}
                  </h3>
                  <div className="text-sm text-gray-600">
                    Total: ₹
                    {transactions
                      .reduce(
                        (sum, t) => sum + (Number(t.amount) || 0),
                        0
                      )
                      .toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
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
                        <TableRow
                          key={transaction.id || `transaction-${index}`}
                        >
                          <TableCell>
                            {new Date(
                              transaction.date
                            ).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{transaction.description}</TableCell>
                          <TableCell>{transaction.category}</TableCell>
                          <TableCell>{transaction.subCategory}</TableCell>
                          <TableCell className="text-right">
                            ₹{(Number(transaction.amount) || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {!isFetchingUnsettled &&
              unsettledExpenses.length === 0 &&
              transactions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No unsettled transactions found for {selectedFriend?.name}
                </div>
              )}

            {/* Settle Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={handleSettle}
                disabled={
                  !selectedBankAccount ||
                  isSettling ||
                  (unsettledExpenses.length > 0 &&
                    unsettledExpenses.some(
                      (exp) =>
                        !expenseSelections[exp.splitwiseTransactionId]
                          ?.categoryId
                    ))
                }
              >
                {isSettling
                  ? "Creating Settlement..."
                  : (() => {
                      const alreadyPaidTotal = transactions.reduce(
                        (sum, t) => sum + (Number(t.amount) || 0),
                        0
                      );
                      const unsettledTotal = unsettledExpenses.reduce(
                        (sum, exp) =>
                          sum + (Number(exp.splitedAmount) || 0),
                        0
                      );
                      const amountToSettle =
                        alreadyPaidTotal - unsettledTotal;
                      return `Settle All (₹${amountToSettle.toFixed(2)})`;
                    })()}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== SPLIT TRANSACTIONS DIALOG ==================== */}
      <Dialog open={splitTxDialogOpen} onOpenChange={setSplitTxDialogOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Splited Transactions — {splitTxFriend?.name}
            </DialogTitle>
            <DialogDescription>
              All split transactions recorded for {splitTxFriend?.name}.
              {splitTxData.length > 0 && " Select specific transactions to settle, or settle all at once."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-auto">
            {isFetchingSplitTx ? (
              <div className="space-y-2 p-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-1/5" />
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-4 w-1/5" />
                    <Skeleton className="h-4 w-1/5" />
                  </div>
                ))}
              </div>
            ) : splitTxData.length > 0 ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="min-w-[200px]">
                    <Select value={splitTxBankAccount} onValueChange={setSplitTxBankAccount}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank account" />
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
                  <Button
                    onClick={handleSplitTxSettleUp}
                    disabled={!splitTxBankAccount || isSplitTxSettling}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSplitTxSettling
                      ? "Settling..."
                      : selectedSplitTxIds.size > 0
                        ? `Settle Up (${selectedSplitTxIds.size} selected)`
                        : "Settle Up All"}
                  </Button>
                </div>
                <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            splitTxData.length > 0 &&
                            selectedSplitTxIds.size === splitTxData.length
                          }
                          onCheckedChange={toggleAllSplitTx}
                          aria-label="Select all transactions"
                        />
                      </TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">
                        Description
                      </TableHead>
                      <TableHead className="font-semibold">
                        Category
                      </TableHead>
                      <TableHead className="font-semibold">
                        Sub Category
                      </TableHead>
                      <TableHead className="text-right font-semibold">
                        Split Amount
                      </TableHead>
                      <TableHead className="text-right font-semibold">
                        Total Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {splitTxData.map((tx, index) => (
                      <TableRow
                        key={tx.id || `split-tx-${index}`}
                        className={cn(
                          selectedSplitTxIds.has(tx.id) && "bg-blue-50"
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedSplitTxIds.has(tx.id)}
                            onCheckedChange={() => toggleSplitTxSelection(tx.id)}
                            aria-label={`Select transaction ${tx.description}`}
                          />
                        </TableCell>
                        <TableCell>
                          {tx.date
                            ? new Date(tx.date).toLocaleDateString()
                            : "N/A"}
                        </TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell>{tx.category || "—"}</TableCell>
                        <TableCell>{tx.subCategory || "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{(Number(tx.amount) || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          ₹
                          {(Number(tx.totalAmount) || 0).toLocaleString(
                            "en-IN",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-between items-center px-4 py-3 border-t bg-slate-50 text-sm font-semibold">
                  <span>
                    {selectedSplitTxIds.size > 0
                      ? `${selectedSplitTxIds.size} of ${splitTxData.length} selected`
                      : `Total: ${splitTxData.length} transaction${splitTxData.length !== 1 ? "s" : ""}`}
                  </span>
                  <span>
                    Split Total: ₹
                    {(() => {
                      const txsToSum =
                        selectedSplitTxIds.size > 0
                          ? splitTxData.filter((tx) => selectedSplitTxIds.has(tx.id))
                          : splitTxData;
                      return txsToSum
                        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                    })()}
                  </span>
                </div>
              </div>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No split transactions found for {splitTxFriend?.name}.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
