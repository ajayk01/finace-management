"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileUp, Loader2, Sparkles, TableProperties } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface ParsedTransaction {
  id: string;
  order: number;
  date: string;
  sourceDate: string;
  description: string;
  amount: number;
  rewards: number;
}

interface AccountTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  rewards: number;
  rewardsExtra: number;
  rewardsName: string;
}

interface ComparisonRow {
  id: string;
  order: number;
  parsed?: ParsedTransaction;
  account?: AccountTransaction;
}

interface RewardsProgramSummary {
  serialNumber: string;
  program: string;
  bonusPoints: number;
}

interface AccountRewardsProgramSummary {
  program: string;
  bonusPoints: number;
}

const DATE_REGEX = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/g;
const TRANSACTION_SKIP_PATTERNS = /(TOTAL AMOUNT DUE|MINIMUM DUE|DUE DATE|REWARD POINTS|REDEEM REWARDS|OPENING BALANCE|IMPORTANT INFORMATION|CARD CONTROL|PURCHASE INDICATOR|SET PIN|DOMESTIC TRANSACTION|INTERNATIONAL TRANSACTION|STATEMENT)/i;
const TRANSACTIONS_API_URL = "http://192.168.1.4:8080/api/transactions";

const parseValidMoneyValue = (value: string): number | null => {
  const cleaned = value.replace(/[^0-9.,-]/g, "").trim();
  if (!cleaned) return null;

  const sign = cleaned.startsWith("-") ? -1 : 1;
  const unsigned = cleaned.replace(/-/g, "");
  const [wholePart, decimalPart] = unsigned.split(".");
  const commaGroups = wholePart.split(",").filter(Boolean);

  if (commaGroups.length > 1) {
    if (commaGroups[0].length < 1 || commaGroups[0].length > 3) return null;
    for (const group of commaGroups.slice(1)) {
      if (group.length !== 3) return null;
    }
  }

  if (decimalPart && decimalPart.length > 2) return null;

  const normalized = `${commaGroups.join("")}${decimalPart ? `.${decimalPart}` : ""}`;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return numeric * sign;
};

const parseDate = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "-";

  const candidate = trimmed.replace(/\s+/g, " ");
  const isoDate = candidate.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const parsedIsoDate = new Date(Number(year), Number(month) - 1, Number(day));
    return parsedIsoDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const parts = candidate.split(/[/-]/);
  if (parts.length === 3) {
    let day: number, month: number, year: number;
    const first = Number(parts[0]);
    const second = Number(parts[1]);
    const third = Number(parts[2]);

    if (third > 31) {
      year = third;
      day = first;
      month = second;
    } else if (first > 12 && second <= 12) {
      day = first;
      month = second;
      year = third;
    } else {
      day = first;
      month = second;
      year = third;
    }

    const normalizedYear = year < 100 ? 2000 + year : year;
    const fallback = new Date(normalizedYear, month - 1, day);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }

  const parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return candidate;
};

const formatAmount = (amount: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const parseAmount = (value: string): number => {
  const parsed = parseValidMoneyValue(value);
  return parsed ?? 0;
};

const getTransactionDay = (dateValue: string): number => {
  const isoDate = dateValue.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return new Date(Number(year), Number(month) - 1, Number(day)).setHours(0, 0, 0, 0);
  }

  const numericDate = dateValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (numericDate) {
    const [, day, month, year] = numericDate;
    return new Date(Number(year), Number(month) - 1, Number(day)).setHours(0, 0, 0, 0);
  }

  const monthDate = dateValue.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (monthDate) {
    const [, day, monthName, year] = monthDate;
    return new Date(`${monthName} ${day}, ${year}`).setHours(0, 0, 0, 0);
  }

  const timestamp = new Date(dateValue).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).setHours(0, 0, 0, 0) : 0;
};

const getMonthRequest = (dateValue: string): { month: string; year: string } | null => {
  const timestamp = getTransactionDay(dateValue);
  if (!timestamp) return null;

  const date = new Date(timestamp);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return { month: months[date.getMonth()], year: String(date.getFullYear()) };
};

const getLatestStatementTransactionDay = (transactions: ParsedTransaction[]): number =>
  Math.max(...transactions.map((transaction) => getTransactionDay(transaction.sourceDate)));

const getEarliestStatementTransactionDay = (transactions: ParsedTransaction[]): number =>
  Math.min(...transactions.map((transaction) => getTransactionDay(transaction.sourceDate)));

const isWithinStatementWindow = (transaction: AccountTransaction, earliestStatementDate: number, latestStatementDate: number): boolean => {
  const accountTransactionDay = getTransactionDay(transaction.date);
  return accountTransactionDay > 0 && accountTransactionDay >= earliestStatementDate && accountTransactionDay <= latestStatementDate;
};

const formatFetchPeriod = ({ month, year }: { month: string; year: string }): string =>
  `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const getComparisonRowHeight = (row: ComparisonRow): string => {
  const longestDescription = Math.max(row.parsed?.description.length ?? 0, row.account?.description.length ?? 0);
  if (longestDescription > 55) return "h-40";
  if (longestDescription > 32) return "h-32";
  return "h-24";
};

const compareTransactions = (parsedTransactions: ParsedTransaction[], accountTransactions: AccountTransaction[]): ComparisonRow[] => {
  const matchedAccountIds = new Set<string>();
  const rows: ComparisonRow[] = parsedTransactions.map((parsed) => {
    const statementDay = getTransactionDay(parsed.sourceDate);
    const matchedAccount = accountTransactions
      .filter((account) =>
        !matchedAccountIds.has(account.id)
        && Math.abs(Math.abs(account.amount) - Math.abs(parsed.amount)) < 0.01,
      )
      .map((account) => ({
        account,
        dateDifference: Math.abs(getTransactionDay(account.date) - statementDay),
      }))
      .filter(({ dateDifference }) => dateDifference <= 2 * DAY_IN_MILLISECONDS)
      .sort((first, second) => first.dateDifference - second.dateDifference)[0]?.account;

    if (matchedAccount) matchedAccountIds.add(matchedAccount.id);
    return { id: `parsed-${parsed.id}`, order: parsed.order, parsed, account: matchedAccount };
  });

  return rows;
};

const extractPageRows = (items: any[]): string => {
  const rows: { y: number; items: { x: number; text: string }[] }[] = [];

  for (const item of items) {
    if (!("str" in item) || !item.str.trim() || !Array.isArray(item.transform)) continue;

    const x = item.transform[4];
    const y = item.transform[5];
    const existingRow = rows.find((row) => Math.abs(row.y - y) < 2);

    if (existingRow) {
      existingRow.items.push({ x, text: item.str });
    } else {
      rows.push({ y, items: [{ x, text: item.str }] });
    }
  }

  return rows
    .sort((first, second) => second.y - first.y)
    .map((row) => row.items.sort((first, second) => first.x - second.x).map((item) => item.text).join(" "))
    .join("\n");
};

const parseStatement = (rawText: string): ParsedTransaction[] => {
  if (!rawText.trim()) return [];

  const normalizedText = rawText
    .replace(/\r/g, "")
    .replace(/[|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const results: ParsedTransaction[] = [];
  const seen = new Set<string>();

  const addParsedRow = (dateValue: string, description: string, amount: number, rewards: number) => {
    const cleanDescription = description.trim();
    if (!cleanDescription || cleanDescription.length < 3 || cleanDescription.length > 80) return;
    if (TRANSACTION_SKIP_PATTERNS.test(cleanDescription)) return;
    if (Math.abs(amount) > 500000 || Math.abs(rewards) > 20000) return;

    const key = `${dateValue}-${cleanDescription}-${Math.abs(amount)}-${rewards}`;
    if (seen.has(key)) return;
    seen.add(key);

    results.push({
      id: key,
      order: results.length,
      date: parseDate(dateValue),
      sourceDate: dateValue,
      description: cleanDescription,
      amount,
      rewards,
    });
  };

  const parseHdfcDomesticTransactions = () => {
    let insideDomesticTable = false;

    for (const rawLine of rawText.replace(/\r/g, "").split(/\n+/)) {
      const line = rawLine.trim();
      if (/^DOMESTIC TRANSACTIONS$/i.test(line)) {
        insideDomesticTable = true;
        continue;
      }

      if (!insideDomesticTable) continue;
      if (/^DATE\s*&\s*TIME\s+TRANSACTION DESCRIPTION/i.test(line)) continue;
      if (/^(PAST DUES|ELIGIBLE FOR EMI|REWARDS PROGRAM POINTS SUMMARY)/i.test(line)) {
        insideDomesticTable = false;
        continue;
      }

      const row = line.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*\|\s*\d{1,2}:\d{2}\s+(.+?)\s+([+-])?\s*C\s*([\d,]+(?:\.\d{1,2})?)\s*(?:l|I)?\s*$/i);
      if (!row) continue;

      const [, dateValue, details, amountSign, amountText] = row;
      const detailsWithoutAmountSign = details.replace(/\+\s*$/, "").trim();
      const rewardMatch = detailsWithoutAmountSign.match(/([+-])\s*(\d[\d,]*)\s*$/);
      const description = rewardMatch
        ? detailsWithoutAmountSign.slice(0, rewardMatch.index).trim()
        : detailsWithoutAmountSign;
      const rewardValue = rewardMatch ? parseAmount(rewardMatch[2]) * (rewardMatch[1] === "-" ? -1 : 1) : 0;
      const amountValue = parseAmount(amountText) * (amountSign === "+" ? -1 : 1);

      addParsedRow(dateValue, description, amountValue, rewardValue);
    }
  };

  const parseSection = (sectionText: string) => {
    const compact = sectionText.replace(/\s+/g, " ").trim();
    if (!compact) return;

    const dateMatches = [...compact.matchAll(DATE_REGEX)];
    if (!dateMatches.length) return;

    for (let index = 0; index < dateMatches.length; index += 1) {
      const dateMatch = dateMatches[index];
      const dateValue = dateMatch[0];
      const startIndex = (dateMatch.index ?? 0) + dateValue.length;
      const endIndex = dateMatches[index + 1]?.index ?? compact.length;
      const chunk = compact.slice(startIndex, endIndex).trim();
      if (!chunk || TRANSACTION_SKIP_PATTERNS.test(chunk)) continue;

      const numericMatches = [...chunk.matchAll(/[-]?\d[\d,]*(?:\.\d{1,2})?/g)];
      if (numericMatches.length < 2) continue;

      const amountRaw = numericMatches[numericMatches.length - 2][0];
      const rewardRaw = numericMatches[numericMatches.length - 1][0];
      const amount = parseAmount(amountRaw);
      const rewards = parseAmount(rewardRaw);
      if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) continue;

      const descriptionStartIndex = chunk.lastIndexOf(amountRaw);
      const description = chunk
        .slice(0, descriptionStartIndex)
        .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s+/, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!description || TRANSACTION_SKIP_PATTERNS.test(description)) continue;

      addParsedRow(dateValue, description, amount, rewards);
    }
  };

  parseHdfcDomesticTransactions();

  if (results.length === 0) {
    const tableHeaders = [...normalizedText.matchAll(/DOMESTIC\s+TRANSACTIONS?\s+(?:DATE(?:\s*(?:&|AND)\s*TIME)?\s+)?TRANSACTION/gi)];
    const tableHeader = tableHeaders.at(-1);
    const domesticLabels = [...normalizedText.matchAll(/DOMESTIC\s+TRANSACTIONS?/gi)];
    const domesticStart = tableHeader
      ? (tableHeader.index ?? 0) + tableHeader[0].length
      : domesticLabels.at(-1)?.index ?? -1;
    const domesticSection = domesticStart >= 0
      ? normalizedText.slice(domesticStart).split(/\bINTERNATIONAL\s+TRANSACTIONS?\b|\bIMPORTANT INFORMATION\b/i)[0]
      : normalizedText;

    if (domesticSection) {
      parseSection(domesticSection);
    }
  }

  if (results.length === 0) {
    const lines = normalizedText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const dateMatch = line.match(DATE_REGEX);
      if (!dateMatch) continue;

      const dateValue = dateMatch[0];
      const chunk = line.replace(dateValue, "").trim();
      if (!chunk || TRANSACTION_SKIP_PATTERNS.test(chunk)) continue;

      const numericMatches = [...chunk.matchAll(/(?:₹|Rs\.?|INR|USD|EUR|GBP)?[-]?\d[\d,]*(?:\.\d{1,2})?/g)];
      if (numericMatches.length === 0) continue;

      const amountValue = parseValidMoneyValue(numericMatches[0][0]);
      const rewardValue = numericMatches.length > 1 ? parseValidMoneyValue(numericMatches[1][0]) : null;
      if (amountValue === null || Math.abs(amountValue) < 0.01) continue;

      const amount = amountValue;
      const reward = rewardValue !== null ? Math.abs(rewardValue) : 0;
      const description = chunk
        .replace(numericMatches[0][0], " ")
        .replace(numericMatches[1]?.[0] ?? "", " ")
        .replace(/(?:reward points?|rewards?)/gi, " ")
        .replace(/[\-:.,]/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

      if (!description || description.length > 140) continue;
      addParsedRow(dateValue, description, amount, reward);
    }
  }

  return results;
};

const parseRewardsProgramSummary = (rawText: string): { rows: RewardsProgramSummary[]; total: number | null } => {
  const rows: RewardsProgramSummary[] = [];
  let total: number | null = null;
  let insideSummary = false;

  for (const rawLine of rawText.replace(/\r/g, "").split(/\n+/)) {
    const line = rawLine.trim();
    if (/^REWARDS PROGRAM POINTS SUMMARY$/i.test(line)) {
      insideSummary = true;
      continue;
    }

    if (!insideSummary || /^SR\s+NO\.?\s+PROGRAMS\s+BONUS POINTS$/i.test(line)) continue;
    if (/^(IMPORTANT INFORMATION|OFFERS ON YOUR CARD|DINERS PRIVILEGE CREDIT CARD STATEMENT)/i.test(line)) {
      insideSummary = false;
      continue;
    }

    const totalMatch = line.match(/^TOTAL\s+([\d,]+)\s+PTS$/i);
    if (totalMatch) {
      total = parseAmount(totalMatch[1]);
      continue;
    }

    const rowMatch = line.match(/^(\d+)\s+(.+?)\s+([\d,]+)\s+PTS$/i);
    if (rowMatch) {
      const [, serialNumber, program, bonusPoints] = rowMatch;
      rows.push({ serialNumber, program: program.trim(), bonusPoints: parseAmount(bonusPoints) });
    }
  }

  return { rows, total };
};

export default function StatementParserPage() {
  const [statementText, setStatementText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [accountTransactions, setAccountTransactions] = useState<AccountTransaction[]>([]);
  const [isLoadingAccountTransactions, setIsLoadingAccountTransactions] = useState(false);
  const [accountTransactionsError, setAccountTransactionsError] = useState<string | null>(null);
  const [accountTransactionPeriods, setAccountTransactionPeriods] = useState<{ month: string; year: string }[]>([]);
  const [hoveredComparisonRowId, setHoveredComparisonRowId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedTransactions = useMemo(() => parseStatement(statementText), [statementText]);
  const rewardsProgramSummary = useMemo(() => parseRewardsProgramSummary(statementText), [statementText]);
  const visibleAccountTransactions = useMemo(() => {
    const earliestStatementDate = getEarliestStatementTransactionDay(parsedTransactions);
    const latestStatementDate = getLatestStatementTransactionDay(parsedTransactions);
    if (!Number.isFinite(earliestStatementDate) || !Number.isFinite(latestStatementDate)) return accountTransactions;

    return accountTransactions.filter((transaction) => isWithinStatementWindow(transaction, earliestStatementDate, latestStatementDate));
  }, [accountTransactions, parsedTransactions]);
  const comparisonRows = useMemo(
    () => compareTransactions(parsedTransactions, visibleAccountTransactions),
    [parsedTransactions, visibleAccountTransactions],
  );
  const totalRewards = parsedTransactions.reduce((sum, tx) => sum + tx.rewards, 0);
  const totalAmount = parsedTransactions.reduce((sum, tx) => sum + Math.max(tx.amount, 0), 0);
  const accountRewardsProgramSummary = useMemo(() => {
    const matchedAccountTransactions = comparisonRows.flatMap((row) => row.account ? [row.account] : []);
    const basePoints = matchedAccountTransactions.reduce((sum, transaction) => sum + transaction.rewards, 0);
    const extraRewardsByProgram = new Map<string, number>();

    for (const transaction of matchedAccountTransactions) {
      if (!transaction.rewardsExtra) continue;
      const program = transaction.rewardsName === "-" ? "Other rewards" : transaction.rewardsName;
      extraRewardsByProgram.set(program, (extraRewardsByProgram.get(program) ?? 0) + transaction.rewardsExtra);
    }

    const rows: AccountRewardsProgramSummary[] = [...extraRewardsByProgram.entries()]
      .sort(([firstProgram], [secondProgram]) => firstProgram.localeCompare(secondProgram))
      .map(([program, bonusPoints]) => ({ program, bonusPoints }));
    const total = basePoints + rows.reduce((sum, row) => sum + row.bonusPoints, 0);

    return { basePoints, rows, total };
  }, [comparisonRows]);

  const fetchAccountTransactions = async (transactions: ParsedTransaction[]) => {
    const earliestStatementDate = getEarliestStatementTransactionDay(transactions);
    const latestStatementDate = getLatestStatementTransactionDay(transactions);
    const periodRequests = [...new Map(
      transactions
        .map((transaction) => getMonthRequest(transaction.sourceDate))
        .filter((request): request is { month: string; year: string } => request !== null)
        .map((request) => [`${request.year}-${request.month}`, request]),
    ).values()];

    if (!periodRequests.length) return;

    setIsLoadingAccountTransactions(true);
    setAccountTransactionsError(null);
    setAccountTransactionPeriods(periodRequests);

    try {
      const responses = await Promise.all(periodRequests.map(async ({ month, year }) => {
        const url = new URL(TRANSACTIONS_API_URL);
        url.searchParams.set("accountId", "20");
        url.searchParams.set("month", month);
        url.searchParams.set("year", year);

        const response = await fetch(url.toString());
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to fetch account transactions");
        return data.transactions || [];
      }));

      const seen = new Set<string>();
      const normalizedTransactions = responses.flat().flatMap((transaction: Record<string, unknown>) => {
        const id = String(transaction.id ?? transaction.ID ?? "");
        if (!id || seen.has(id)) return [];
        seen.add(id);

        const amount = Number(transaction.amount ?? transaction.AMOUNT ?? 0);
        const rewardsValue = transaction.rewardsBase ?? transaction.REWARDS_BASE ?? transaction.rewards ?? transaction.REWARDS ?? 0;
        const rewards = Number(rewardsValue);
        const rewardsExtra = Number(transaction.rewardsExtra ?? transaction.REWARDS_EXTRA ?? 0);
        const date = String(transaction.date ?? transaction.DATE ?? "");
        return [{
          id,
          date,
          description: String(transaction.description ?? transaction.NOTES ?? "-"),
          amount: Number.isFinite(amount) ? amount : 0,
          rewards: Number.isFinite(rewards) ? rewards : 0,
          rewardsExtra: Number.isFinite(rewardsExtra) ? rewardsExtra : 0,
          rewardsName: String(transaction.rewardsName ?? transaction.REWARDS_NAME ?? "-"),
        }];
      }).filter((transaction) => isWithinStatementWindow(transaction, earliestStatementDate, latestStatementDate));
      setAccountTransactions(normalizedTransactions);
    } catch (error) {
      setAccountTransactionsError(error instanceof Error ? error.message : "Unable to load account transactions.");
    } finally {
      setIsLoadingAccountTransactions(false);
    }
  };

  const handlePdfUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Please upload a PDF file");
      return;
    }

    setIsParsingPdf(true);
    setPdfError(null);
    setAccountTransactions([]);
    setAccountTransactionsError(null);
    setAccountTransactionPeriods([]);
    setUploadedFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      let extractedText = "";

      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const textContent = await page.getTextContent();
        const pageText = extractPageRows(textContent.items);
        extractedText += `${pageText}\n`;
      }

      const cleanText = extractedText.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!cleanText) {
        throw new Error("The PDF does not contain readable text.");
      }

      setStatementText(cleanText);
      await fetchAccountTransactions(parseStatement(cleanText));
    } catch (error) {
      console.error("PDF parsing failed", error);
      setPdfError(error instanceof Error ? error.message : "Unable to parse the PDF file.");
    } finally {
      setIsParsingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TableProperties className="h-5 w-5 text-primary" />
              Statement Parser
            </CardTitle>
            <CardDescription>
              Upload a PDF or paste a transaction page, and it will be extracted into date, description, amount, and reward columns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handlePdfUpload}
                className="hidden"
                id="statement-pdf-upload"
              />
              <label htmlFor="statement-pdf-upload">
                <Button asChild variant="outline" disabled={isParsingPdf}>
                  <span className="inline-flex items-center gap-2">
                    {isParsingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                    {isParsingPdf ? "Parsing PDF..." : "Upload PDF"}
                  </span>
                </Button>
              </label>
              {uploadedFileName && (
                <span className="text-sm text-muted-foreground">Loaded: {uploadedFileName}</span>
              )}
            </div>

            {pdfError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {pdfError}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">Transactions found</div>
                <div className="mt-2 text-2xl font-semibold">{parsedTransactions.length}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">Total purchases</div>
                <div className="mt-2 text-2xl font-semibold">{formatAmount(totalAmount)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-sm text-muted-foreground">Total rewards</div>
                <div className="mt-2 text-2xl font-semibold">{formatAmount(totalRewards)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {accountTransactionsError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {accountTransactionsError}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Parsed statement transactions
              </CardTitle>
              <CardDescription className="invisible" aria-hidden="true">
                Fetching statement transactions
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {comparisonRows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">Upload a statement PDF to view its parsed transactions.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Transaction description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Rewards</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonRows.map((row) => {
                      const isHovered = hoveredComparisonRowId === row.id;
                      const rowHeight = getComparisonRowHeight(row);
                      return (
                      <TableRow
                        key={`parsed-${row.id}`}
                        className={`${rowHeight} ${isHovered ? "bg-primary/10" : !row.parsed ? "bg-muted/30" : ""}`}
                        onMouseEnter={() => setHoveredComparisonRowId(row.id)}
                        onMouseLeave={() => setHoveredComparisonRowId(null)}
                      >
                        {row.parsed ? (
                          <>
                            <TableCell>{row.parsed.date}</TableCell>
                            <TableCell className="font-medium">{row.parsed.description}</TableCell>
                            <TableCell className="text-right">{formatAmount(row.parsed.amount)}</TableCell>
                            <TableCell className="text-right">{row.parsed.rewards}</TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={4} className="text-muted-foreground">No matching parsed transaction</TableCell>
                        )}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TableProperties className="h-5 w-5 text-primary" />
                Account 20 transactions
              </CardTitle>
              {accountTransactionPeriods.length > 0 && (
                <CardDescription>
                  Fetching: {accountTransactionPeriods.map(formatFetchPeriod).join(", ")}
                </CardDescription>
              )}
              {isLoadingAccountTransactions && <CardDescription>Loading transactions from the API...</CardDescription>}
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {comparisonRows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">Account transactions load after a PDF is parsed.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Transaction description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Rewards</TableHead>
                      <TableHead className="text-right">Rewards extra</TableHead>
                      <TableHead>Rewards name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonRows.map((row) => {
                      const isHovered = hoveredComparisonRowId === row.id;
                      const rowHeight = getComparisonRowHeight(row);
                      return (
                      <TableRow
                        key={`account-${row.id}`}
                        className={`${rowHeight} ${isHovered ? "bg-primary/10" : !row.account ? "bg-muted/30" : ""}`}
                        onMouseEnter={() => setHoveredComparisonRowId(row.id)}
                        onMouseLeave={() => setHoveredComparisonRowId(null)}
                      >
                        {row.account ? (
                          <>
                            <TableCell>{parseDate(row.account.date)}</TableCell>
                            <TableCell className="font-medium">{row.account.description}</TableCell>
                            <TableCell className="text-right">{formatAmount(row.account.amount)}</TableCell>
                            <TableCell className="text-right">{row.account.rewards}</TableCell>
                            <TableCell className="text-right">{row.account.rewardsExtra}</TableCell>
                            <TableCell>{row.account.rewardsName}</TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={6} className="text-muted-foreground">No matching account transaction</TableCell>
                        )}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {(rewardsProgramSummary.rows.length > 0 || comparisonRows.length > 0) && (
          <div className="grid gap-6 xl:grid-cols-2">
            {rewardsProgramSummary.rows.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>PDF Rewards Program Points Summary</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Sr. no.</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead className="text-right">Bonus points</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>-</TableCell>
                        <TableCell className="font-medium">Base points</TableCell>
                        <TableCell className="text-right">{totalRewards}</TableCell>
                      </TableRow>
                      {rewardsProgramSummary.rows.map((row) => (
                        <TableRow key={`${row.serialNumber}-${row.program}`}>
                          <TableCell>{row.serialNumber}</TableCell>
                          <TableCell className="font-medium">{row.program}</TableCell>
                          <TableCell className="text-right">{row.bonusPoints}</TableCell>
                        </TableRow>
                      ))}
                      {rewardsProgramSummary.total !== null && (
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell colSpan={2}>Total</TableCell>
                          <TableCell className="text-right">{rewardsProgramSummary.total}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {comparisonRows.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Account 20 Rewards Program Summary</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Program</TableHead>
                        <TableHead className="text-right">Points</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Base points</TableCell>
                        <TableCell className="text-right">{accountRewardsProgramSummary.basePoints}</TableCell>
                      </TableRow>
                      {accountRewardsProgramSummary.rows.map((row) => (
                        <TableRow key={row.program}>
                          <TableCell className="font-medium">{row.program}</TableCell>
                          <TableCell className="text-right">{row.bonusPoints}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{accountRewardsProgramSummary.total}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
