"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  CreditCard,
  FileText,
  Layers,
  Tag,
  Wallet,
  Users,
  ArrowRightLeft,
} from "lucide-react";

interface SplitwiseDetail {
  splitwiseTransactionId: string;
  friendId: string;
  friendName: string;
  splitAmount: number;
}

interface Transaction {
  id: string;
  date: string | null;
  description: string;
  amount: number;
  type: "Income" | "Expense" | "Investment" | "Transfer" | "Other";
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
  splitwiseDetails?: SplitwiseDetail[];
}

interface ViewTransactionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Invalid Date";
  }
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getTypeBadgeClasses = (type: string) => {
  switch (type) {
    case "Income":
      return "bg-green-600 text-white hover:bg-green-600/80";
    case "Expense":
      return "bg-red-600 text-white hover:bg-red-600/80";
    case "Investment":
      return "bg-blue-600 text-white hover:bg-blue-600/80";
    case "Transfer":
      return "bg-purple-600 text-white hover:bg-purple-600/80";
    default:
      return "";
  }
};

export function ViewTransactionDetailsDialog({
  open,
  onOpenChange,
  transaction,
}: ViewTransactionDetailsDialogProps) {
  if (!transaction) return null;

  const hasSplitwise =
    transaction.splitwiseDetails && transaction.splitwiseDetails.length > 0;

  const totalSplitAmount = hasSplitwise
    ? transaction.splitwiseDetails!.reduce((sum, d) => sum + d.splitAmount, 0)
    : 0;

  const yourShare = hasSplitwise
    ? transaction.amount - totalSplitAmount
    : transaction.amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Transaction Details</DialogTitle>
          <DialogDescription>
            Complete details for transaction #{transaction.id}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="space-y-5">
            {/* Amount & Type */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Amount</p>
                <p
                  className={cn("text-2xl font-bold", {
                    "text-green-600": transaction.type === "Income",
                    "text-red-600": transaction.type === "Expense",
                    "text-blue-600":
                      transaction.type === "Investment" ||
                      transaction.type === "Transfer",
                  })}
                >
                  {transaction.type === "Income" ? "+" : ""}
                  {formatCurrency(transaction.amount)}
                </p>
              </div>
              <Badge className={getTypeBadgeClasses(transaction.type)}>
                {transaction.type}
              </Badge>
            </div>

            <Separator />

            {/* Core Details */}
            <div className="grid gap-4">
              <DetailRow
                icon={<FileText className="h-4 w-4" />}
                label="Description"
                value={transaction.description}
              />
              <DetailRow
                icon={<CalendarIcon className="h-4 w-4" />}
                label="Date"
                value={formatDate(transaction.date)}
              />
              <DetailRow
                icon={<Tag className="h-4 w-4" />}
                label="Category"
                value={transaction.category || "N/A"}
              />
              {transaction.subCategory && (
                <DetailRow
                  icon={<Layers className="h-4 w-4" />}
                  label="Sub-category"
                  value={transaction.subCategory}
                />
              )}
              <DetailRow
                icon={<Wallet className="h-4 w-4" />}
                label={
                  transaction.type === "Investment" ||
                  transaction.type === "Transfer"
                    ? "From Account"
                    : "Account"
                }
                value={transaction.accountName || "N/A"}
              />
              {(transaction.type === "Investment" ||
                transaction.type === "Transfer") &&
                transaction.investmentAccountName && (
                  <DetailRow
                    icon={<ArrowRightLeft className="h-4 w-4" />}
                    label="To Account"
                    value={transaction.investmentAccountName}
                  />
                )}
              {transaction.capId && (
                <DetailRow
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Credit Card Cap ID"
                  value={transaction.capId}
                />
              )}
              {transaction.rewards != null && transaction.rewards > 0 && (
                <DetailRow
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Rewards"
                  value={formatCurrency(transaction.rewards)}
                />
              )}
            </div>

            {/* Splitwise Section */}
            {hasSplitwise && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-semibold text-sm">Splitwise Details</h4>
                  </div>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Friend</TableHead>
                          <TableHead className="text-right">
                            Their Share
                          </TableHead>
                          <TableHead className="text-right text-xs text-muted-foreground">
                            Splitwise ID
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transaction.splitwiseDetails!.map((detail, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {detail.friendName}
                            </TableCell>
                            <TableCell className="text-right text-orange-600 font-medium">
                              {formatCurrency(detail.splitAmount)}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {detail.splitwiseTransactionId}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Amount</span>
                      <span className="font-medium">
                        {formatCurrency(transaction.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Others&apos; Share
                      </span>
                      <span className="font-medium text-orange-600">
                        {formatCurrency(totalSplitAmount)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Your Share</span>
                      <span className="text-red-600">
                        {formatCurrency(yourShare)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}
