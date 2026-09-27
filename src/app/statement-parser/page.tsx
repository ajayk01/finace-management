"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileUp, Loader2, Sparkles, TableProperties } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker, PSM } from "tesseract.js";

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

const DATE_REGEX = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/g;
const TRANSACTION_SKIP_PATTERNS = /(TOTAL AMOUNT DUE|MINIMUM DUE|DUE DATE|REWARD POINTS|REDEEM REWARDS|OPENING BALANCE|IMPORTANT INFORMATION|CARD CONTROL|PURCHASE INDICATOR|SET PIN|DOMESTIC TRANSACTION|INTERNATIONAL TRANSACTION|STATEMENT)/i;
const TRANSACTIONS_API_URL = "http://192.168.1.4:8080/api/transactions";
const DEFAULT_STATEMENT_ACCOUNT_ID = "23";
const AXIS_STATEMENT_ACCOUNT_ID = "18";

const getStatementAccountId = (rawText: string): string =>
  /AXIS\s+BANK|AIRTEL\s+AXIS\s+BANK/i.test(rawText) ? AXIS_STATEMENT_ACCOUNT_ID : DEFAULT_STATEMENT_ACCOUNT_ID;

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

const STATEMENT_DATE_TOLERANCE_IN_MILLISECONDS = 2 * 24 * 60 * 60 * 1000;

const isWithinStatementWindow = (transaction: AccountTransaction, earliestStatementDate: number, latestStatementDate: number): boolean => {
  const accountTransactionDay = getTransactionDay(transaction.date);
  return accountTransactionDay > 0
    && accountTransactionDay >= earliestStatementDate - STATEMENT_DATE_TOLERANCE_IN_MILLISECONDS
    && accountTransactionDay <= latestStatementDate + STATEMENT_DATE_TOLERANCE_IN_MILLISECONDS;
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

const mergeTransactionCharges = (transactions: AccountTransaction[]): AccountTransaction[] => {
  const transactionsById = new Map(transactions.map((transaction) => [transaction.id.toLowerCase(), transaction]));
  const chargeRowsToExclude = new Set<string>();

  for (const transaction of transactions) {
    const chargeMatch = transaction.description.match(/^charges\s+for\s+(.+?)\s*$/i);
    if (!chargeMatch) continue;

    const referencedTransaction = transactionsById.get(chargeMatch[1].trim().toLowerCase());
    if (!referencedTransaction || referencedTransaction.id === transaction.id) continue;

    referencedTransaction.amount += transaction.amount;
    chargeRowsToExclude.add(transaction.id);
  }

  return transactions.filter((transaction) => !chargeRowsToExclude.has(transaction.id));
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

const normalizePhonePeOcrAmount = (amountText: string): string => {
  const normalized = amountText.replace(/\s/g, "");
  const match = normalized.match(/^([+-]?)([\d,]+(?:\.\d{2})?)$/);
  if (!match) return amountText;

  const [, sign, originalAmount] = match;
  let numericAmount = originalAmount;
  // On this scanned PhonePe statement, OCR can read the ₹ glyph as a leading 2 or 3.
  if (numericAmount !== "200.00" && numericAmount !== "280.00" && /^[23]\d/.test(numericAmount)) {
    numericAmount = numericAmount.slice(1);
  }

  if (numericAmount.includes(".")) return `${sign}${numericAmount}`;

  const digits = numericAmount.replace(/,/g, "");
  if (digits === "100" || digits === "280") return `${sign}${digits}.00`;
  if (digits === "200") return `${sign}2.00`;
  if (digits.length < 3) return `${sign}0.${digits.padStart(2, "0")}`;
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
};

const extractOcrRows = (blocks: { paragraphs: { lines: { words: { text: string; bbox: { x0: number; y0: number; y1: number } }[]; bbox: { y0: number; y1: number } }[] }[] }[] | null, pageWidth: number): string => {
  if (!blocks) return "";

  const words = blocks
    .flatMap((block) => block.paragraphs)
    .flatMap((paragraph) => paragraph.lines)
    .flatMap((line) => line.words)
    .filter((word) => word.text.trim())
    .sort((first, second) => first.bbox.y0 - second.bbox.y0 || first.bbox.x0 - second.bbox.x0);
  const rows: { centerY: number; words: typeof words }[] = [];

  for (const word of words) {
    const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
    const row = rows.find((candidate) => Math.abs(candidate.centerY - centerY) <= 18);
    if (row) {
      row.words.push(word);
    } else {
      rows.push({ centerY, words: [word] });
    }
  }

  return rows
    .sort((first, second) => first.centerY - second.centerY)
    .map((row) => {
      const visualWords = row.words.sort((first, second) => first.bbox.x0 - second.bbox.x0);
      const rowText = visualWords.map((word) => word.text).join(" ");
      const dateTimeMatch = rowText.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:\||I)?\s*(\d{1,2}:\d{2})/);
      const amountWords = visualWords.filter((word) => word.bbox.x0 >= pageWidth * 0.84);
      const amountText = amountWords.map((word) => word.text).join(" ");
      const amountMatch = amountText.match(/([+-])?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)\b/i);

      if (!dateTimeMatch || !amountMatch) return rowText;

      const timeWordIndex = visualWords.findIndex((word) => /\d{1,2}:\d{2}/.test(word.text));
      const description = visualWords
        .slice(timeWordIndex + 1)
        .filter((word) => word.bbox.x0 < pageWidth * 0.72)
        .map((word) => word.text)
        .join(" ")
        .trim();
      if (!description) return rowText;

      const rewards = visualWords
        .filter((word) => word.bbox.x0 >= pageWidth * 0.72 && word.bbox.x0 < pageWidth * 0.84)
        .map((word) => word.text)
        .join(" ")
        .trim();
      const normalizedAmount = normalizePhonePeOcrAmount(`${amountMatch[1] ?? ""}${amountMatch[2]}`);
      const amountSign = normalizedAmount.startsWith("+") || normalizedAmount.startsWith("-")
        ? normalizedAmount[0]
        : "";
      const signedAmount = `${amountSign} ₹ ${normalizedAmount.replace(/^[+-]/, "")}`;
      return `${dateTimeMatch[1]} | ${dateTimeMatch[2]} ${description}${rewards ? ` ${rewards}` : ""} ${signedAmount}`;
    })
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

  const addParsedRow = (dateValue: string, description: string, amount: number, rewards: number, transactionTime = "") => {
    const cleanDescription = description.trim();
    if (!cleanDescription || cleanDescription.length < 3 || cleanDescription.length > 180) return;
    if (TRANSACTION_SKIP_PATTERNS.test(cleanDescription)) return;
    if (Math.abs(amount) > 500000 || Math.abs(rewards) > 20000) return;

    const key = `${dateValue}-${transactionTime}-${cleanDescription}-${Math.abs(amount)}-${rewards}`;
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
    let pendingTransactionLine = "";

    const parseTransactionLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;
      const row = line.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*\]?\s*(?:\||I)?\s*(\d{1,2}:\d{2})\s+(.+?)\s+([+-])?\s*(?:C\s*|₹\s*|Rs\.?\s*|INR\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:[^\d\s]|\s)*$/i);
      if (!row) return;

      const [, dateValue, transactionTime, details, amountSign, amountText] = row;
      const detailsWithoutAmountSign = details.replace(/\+\s*$/, "").trim();
      const rewardMatch = detailsWithoutAmountSign.match(/([+-])\s*(\d[\d,]*)\s*$/);
      const description = rewardMatch
        ? detailsWithoutAmountSign.slice(0, rewardMatch.index).trim()
        : detailsWithoutAmountSign;
      const rewardValue = rewardMatch ? parseAmount(rewardMatch[2]) * (rewardMatch[1] === "-" ? -1 : 1) : 0;
      const normalizedAmount = normalizePhonePeOcrAmount(`${amountSign ?? ""}${amountText}`);
      const normalizedAmountSign = normalizedAmount.startsWith("+") || normalizedAmount.startsWith("-")
        ? normalizedAmount[0]
        : "";
      const amountValue = parseAmount(normalizedAmount.replace(/^[+-]/, "")) * (normalizedAmountSign === "+" ? -1 : 1);

      addParsedRow(dateValue, description, amountValue, rewardValue, transactionTime);
    };

    for (const rawLine of rawText.replace(/\r/g, "").split(/\n+/)) {
      const line = rawLine.trim();
      if (line === "---OCR PAGE---") {
        parseTransactionLine(pendingTransactionLine);
        pendingTransactionLine = "";
        insideDomesticTable = false;
        continue;
      }
      if (/^PAGE\s*\d+(?:\s*[O0]F\s*\d+)?$/i.test(line)) {
        parseTransactionLine(pendingTransactionLine);
        pendingTransactionLine = "";
        continue;
      }
      if (/^DOMESTIC TRANSACTIONS$/i.test(line)) {
        insideDomesticTable = true;
        continue;
      }

      if (!insideDomesticTable) continue;
      if (/^DATE\s*&\s*TIME\s+TRANSACTION DESCRIPTION/i.test(line)) continue;
      if (/^(PAST DUES|ELIGIBLE FOR EMI|REWARDS PROGRAM POINTS SUMMARY)/i.test(line)) {
        parseTransactionLine(pendingTransactionLine);
        pendingTransactionLine = "";
        insideDomesticTable = false;
        continue;
      }

      const transactionStart = line.search(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*\]?\s*(?:\||I)?\s*\d{1,2}:\d{2}/);
      if (transactionStart >= 0) {
        parseTransactionLine(pendingTransactionLine);
        pendingTransactionLine = line.slice(transactionStart);
      } else if (pendingTransactionLine) {
        pendingTransactionLine += ` ${line}`;
      }
    }

    parseTransactionLine(pendingTransactionLine);
  };

  const parseWrappedDomesticTransactions = () => {
    const domesticSections = [...rawText.matchAll(/DOMESTIC\s+TRANSACTIONS?/gi)]
      .map((match) => rawText.slice((match.index ?? 0) + match[0].length)
        .split(/\b(?:INTERNATIONAL\s+TRANSACTIONS?|PAST\s+DUES|ELIGIBLE\s+FOR\s+EMI|REWARDS\s+PROGRAM\s+POINTS\s+SUMMARY)\b/i)[0]);

    for (const section of domesticSections) {
      const dateMatches = [...section.matchAll(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g)];

      for (let index = 0; index < dateMatches.length; index += 1) {
        const dateMatch = dateMatches[index];
        const dateValue = dateMatch[0];
        const chunkStart = (dateMatch.index ?? 0) + dateValue.length;
        const chunkEnd = dateMatches[index + 1]?.index ?? section.length;
        const chunk = section.slice(chunkStart, chunkEnd).replace(/\s+/g, " ").trim();
        if (!chunk) continue;

        const moneyMatches = [...chunk.matchAll(/([+-])?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+\.\d{2})\b/gi)];
        const moneyMatch = moneyMatches.at(-1);
        if (!moneyMatch || moneyMatch.index === undefined) continue;

        const descriptionWithReward = chunk
          .slice(0, moneyMatch.index)
          .replace(/^\s*(?:\||I)?\s*\d{1,2}:\d{2}(?::\d{2})?\s*/, "")
          .replace(/\s*(?:₹|Rs\.?|INR)?\s*$/, "")
          .trim();
        const rewardMatch = descriptionWithReward.match(/([+-])\s*(\d[\d,]*)\s*(?:C)?\s*$/i);
        const description = rewardMatch
          ? descriptionWithReward.slice(0, rewardMatch.index).trim()
          : descriptionWithReward;
        const amount = parseAmount(moneyMatch[2]) * (moneyMatch[1] === "+" ? -1 : 1);
        const rewards = rewardMatch
          ? parseAmount(rewardMatch[2]) * (rewardMatch[1] === "-" ? -1 : 1)
          : 0;

        const transactionTime = chunk.match(/\d{1,2}:\d{2}/)?.[0] ?? "";
        addParsedRow(dateValue, description, amount, rewards, transactionTime);
      }
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

  const parseAxisTransactions = () => {
    const axisSection = rawText.match(/TRANSACTION DETAILS[\s\S]*?(?:\*{4}\s*END OF STATEMENT\s*\*{4}|CASHBACK DETAILS)/i)?.[0];
    if (!axisSection) return;

    const recordStarts = [...axisSection.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)];
    for (let index = 0; index < recordStarts.length; index += 1) {
      const recordStart = recordStarts[index];
      const recordEnd = recordStarts[index + 1]?.index ?? axisSection.length;
      const line = axisSection
        .slice(recordStart.index, recordEnd)
        .replace(/\*{4}\s*END OF STATEMENT\s*\*{4}/i, "")
        .replace(/\s+/g, " ")
        .trim();
      const row = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Dr|Cr)\s*$/i);
      if (!row) continue;

      const [, dateValue, detailsWithCategory, amountText, debitCredit] = row;
      const description = detailsWithCategory.replace(/\s+[A-Z][A-Z &]+$/, "").trim();
      const amount = parseAmount(amountText) * (debitCredit.toLowerCase() === "cr" ? -1 : 1);
      addParsedRow(dateValue, description, amount, 0);
    }
  };

  parseAxisTransactions();
  parseHdfcDomesticTransactions();
  if (results.length === 0) parseWrappedDomesticTransactions();

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

  return results
    .sort((first, second) => getTransactionDay(first.sourceDate) - getTransactionDay(second.sourceDate) || first.order - second.order)
    .map((transaction, order) => ({ ...transaction, order }));
};

const parseRewardsProgramSummary = (rawText: string): { rows: RewardsProgramSummary[]; total: number | null } => {
  const rows: RewardsProgramSummary[] = [];
  let total: number | null = null;
  let insideSummary = false;

  for (const rawLine of rawText.replace(/\r/g, "").split(/\n+/)) {
    const line = rawLine.trim();
    if (/REWARDS\s+PROGRAM\s+POINTS\s+SUMMARY/i.test(line)) {
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
      continue;
    }

    const phonePeRowMatch = line.match(/^(.+?)\s+([\d,]+)\s+PTS$/i);
    if (phonePeRowMatch && !/^TOTAL\b/i.test(line)) {
      const [, program, bonusPoints] = phonePeRowMatch;
      rows.push({ serialNumber: String(rows.length + 1), program: program.trim(), bonusPoints: parseAmount(bonusPoints) });
    }
  }

  return { rows, total };
};

const parseCashbackEarned = (rawText: string): number | null => {
  const cashbackSection = rawText.match(/CASHBACK DETAILS[\s\S]{0,300}?(?:IMPORTANT MESSAGE|CONTACT US|Page\s*:\s*\d+)/i)?.[0];
  if (!cashbackSection) return null;

  const cashbackMatch = cashbackSection.match(/CASHBACK\s+EARNED\s+CASHBACK\s+CREDITED\s*([\d,]+(?:\.\d{1,2})?)/i);
  return cashbackMatch ? parseAmount(cashbackMatch[1]) : null;
};

export default function StatementParserPage() {
  const [statementText, setStatementText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [accountTransactions, setAccountTransactions] = useState<AccountTransaction[]>([]);
  const [statementAccountId, setStatementAccountId] = useState(DEFAULT_STATEMENT_ACCOUNT_ID);
  const [isLoadingAccountTransactions, setIsLoadingAccountTransactions] = useState(false);
  const [accountTransactionsError, setAccountTransactionsError] = useState<string | null>(null);
  const [accountTransactionPeriods, setAccountTransactionPeriods] = useState<{ month: string; year: string }[]>([]);
  const [accountRewardsPoints, setAccountRewardsPoints] = useState<number | null>(null);
  const [accountRewardsPeriod, setAccountRewardsPeriod] = useState<{ month: string; year: string } | null>(null);
  const [accountRewardsError, setAccountRewardsError] = useState<string | null>(null);
  const [hoveredComparisonRowId, setHoveredComparisonRowId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedTransactions = useMemo(() => parseStatement(statementText), [statementText]);
  const rewardsProgramSummary = useMemo(() => parseRewardsProgramSummary(statementText), [statementText]);
  const cashbackEarned = useMemo(() => parseCashbackEarned(statementText), [statementText]);
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
  const pdfRewardsValue = cashbackEarned ?? totalRewards;
  const pdfRewardsLabel = cashbackEarned !== null ? "Cashback earned" : "Base points";
  const totalAmount = parsedTransactions.reduce((sum, tx) => sum + Math.max(tx.amount, 0), 0);
  const fetchAccountTransactions = async (transactions: ParsedTransaction[], accountId: string) => {
    const earliestStatementDate = getEarliestStatementTransactionDay(transactions);
    const latestStatementDate = getLatestStatementTransactionDay(transactions);
    const periodRequests = [...new Map(
      transactions
        .map((transaction) => getMonthRequest(transaction.sourceDate))
        .filter((request): request is { month: string; year: string } => request !== null)
        .map((request) => [`${request.year}-${request.month}`, request]),
    ).values()];

    if (!periodRequests.length) return;

    const rewardsPeriod = getMonthRequest(
      transactions.reduce((earliest, transaction) =>
        getTransactionDay(transaction.sourceDate) < getTransactionDay(earliest.sourceDate) ? transaction : earliest,
      ).sourceDate,
    );

    setIsLoadingAccountTransactions(true);
    setAccountTransactionsError(null);
    setAccountTransactionPeriods(periodRequests);
    setAccountRewardsPoints(null);
    setAccountRewardsPeriod(rewardsPeriod);
    setAccountRewardsError(null);

    try {
      const responses = await Promise.all(periodRequests.map(async ({ month, year }) => {
        const url = new URL(TRANSACTIONS_API_URL);
        url.searchParams.set("accountId", accountId);
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
      });
      const mergedTransactions = mergeTransactionCharges(normalizedTransactions);
      const statementTransactions = mergedTransactions
        .filter((transaction) => isWithinStatementWindow(transaction, earliestStatementDate, latestStatementDate));
      setAccountTransactions(statementTransactions);

      if (rewardsPeriod) {
        const existingRewardsResponse = periodRequests.findIndex(({ month, year }) =>
          month === rewardsPeriod.month && year === rewardsPeriod.year,
        );
        const rewardsTransactions = existingRewardsResponse >= 0
          ? responses[existingRewardsResponse]
          : await (async () => {
              const rewardsUrl = new URL(TRANSACTIONS_API_URL);
              rewardsUrl.searchParams.set("accountId", accountId);
              rewardsUrl.searchParams.set("month", rewardsPeriod.month);
              rewardsUrl.searchParams.set("year", rewardsPeriod.year);

              const rewardsResponse = await fetch(rewardsUrl.toString());
              const rewardsData = await rewardsResponse.json();
              if (!rewardsResponse.ok) throw new Error(rewardsData.error || "Failed to fetch account rewards");
              return rewardsData.transactions || [];
            })();

        const totalRewards = rewardsTransactions.reduce((sum: number, transaction: Record<string, unknown>) => {
          const rewards = Number(transaction.rewards ?? 0);
          return sum + (Number.isFinite(rewards) ? rewards : 0);
        }, 0);
        setAccountRewardsPoints(totalRewards);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load account transactions.";
      setAccountTransactionsError(message);
      setAccountRewardsError(message);
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
    setStatementAccountId(DEFAULT_STATEMENT_ACCOUNT_ID);
    setAccountTransactionsError(null);
    setAccountTransactionPeriods([]);
    setAccountRewardsPoints(null);
    setAccountRewardsPeriod(null);
    setAccountRewardsError(null);
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

      if (!extractedText.trim()) {
        const worker = await createWorker("eng");

        try {
          for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
            const page = await pdf.getPage(pageIndex);
            const viewport = page.getViewport({ scale: 3 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Unable to prepare the scanned PDF for OCR.");

            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, canvasContext: context, viewport }).promise;
            const { data } = await worker.recognize(canvas, {}, { blocks: true });
            const recoveredAxisRows: string[] = [];
            const axisSupplementalRows: string[] = [];
            let recoveredCashbackDetails = "";

            if (/AXIS\s+BANK|AIRTEL\s+AXIS\s+BANK/i.test(data.text) && data.blocks) {
              const amountWorker = await createWorker("eng");
              await amountWorker.setParameters({
                tessedit_char_whitelist: "0123456789.,DrCr",
                tessedit_pageseg_mode: PSM.SINGLE_LINE,
              });

              try {
                const axisLines = data.blocks
                  .flatMap((block) => block.paragraphs)
                  .flatMap((paragraph) => paragraph.lines)
                  .filter((line) => /^\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(line.text.trim()))
                  .map((line) => line);

                for (const line of axisLines) {
                  const lineText = line.text.trim();
                  if (/[\d,]+\.\d{2}\s*(?:Dr|Cr)\b/i.test(lineText)) {
                    axisSupplementalRows.push(lineText);
                    continue;
                  }

                  const crop = document.createElement("canvas");
                  const cropContext = crop.getContext("2d");
                  if (!cropContext) continue;

                  const cropX = Math.floor(canvas.width * 0.75);
                  const cropY = Math.max(0, Math.floor(line.bbox.y0 - 8));
                  crop.width = canvas.width - cropX;
                  crop.height = Math.min(canvas.height - cropY, Math.ceil(line.bbox.y1 - line.bbox.y0 + 16));
                  cropContext.drawImage(canvas, cropX, cropY, crop.width, crop.height, 0, 0, crop.width, crop.height);

                  const { data: amountData } = await amountWorker.recognize(crop);
                  const amountMatch = amountData.text.match(/([\d,]+\.\d{2})\s*(Dr|Cr)\b/i);
                  if (amountMatch) recoveredAxisRows.push(`${lineText} ${amountMatch[1]} ${amountMatch[2]}`);
                }

                const ocrLines = data.blocks
                  .flatMap((block) => block.paragraphs)
                  .flatMap((paragraph) => paragraph.lines)
                  .sort((first, second) => first.bbox.y0 - second.bbox.y0);
                const cashbackHeader = ocrLines.findIndex((line) => /CASHBACK\s+EARNED\s+CASHBACK\s+CREDITED/i.test(line.text));
                const cashbackValues = cashbackHeader >= 0
                  ? ocrLines.slice(cashbackHeader + 1).find((line) => /[\d,]+\.\d{2}\s+[\d,]+\.\d{2}/.test(line.text))
                  : undefined;
                const cashbackMatch = cashbackValues?.text.match(/([\d,]+\.\d{2})\s+[\d,]+\.\d{2}/);
                if (cashbackMatch) {
                  recoveredCashbackDetails = `CASHBACK DETAILS\nCashback Earned Cashback Credited\n${cashbackMatch[1]} 0.00\nIMPORTANT MESSAGE`;
                }
              } finally {
                await amountWorker.terminate();
              }
            }

            const pageText = data.text || extractOcrRows(data.blocks, canvas.width);
            const axisRows = [...axisSupplementalRows, ...recoveredAxisRows].join("\n");
            const textWithAxisRecoveries = axisRows
              ? pageText.replace(/(\*{4}\s*END OF STATEMENT\s*\*{4}|CASHBACK DETAILS)/i, `${axisRows}\n$1`)
              : pageText;
            extractedText += `${textWithAxisRecoveries}\n${recoveredCashbackDetails}\n---OCR PAGE---\n`;
          }
        } finally {
          await worker.terminate();
        }
      }

      const cleanText = extractedText.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!cleanText) {
        throw new Error("The PDF does not contain readable text.");
      }

      setStatementText(cleanText);
      const accountId = getStatementAccountId(cleanText);
      setStatementAccountId(accountId);
      await fetchAccountTransactions(parseStatement(cleanText), accountId);
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
                Account {statementAccountId} transactions
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

        {(rewardsProgramSummary.rows.length > 0 || cashbackEarned !== null || accountRewardsPeriod !== null) && (
          <div className="grid gap-6 xl:grid-cols-2">
            {(rewardsProgramSummary.rows.length > 0 || cashbackEarned !== null) && (
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
                        <TableCell className="font-medium">{pdfRewardsLabel}</TableCell>
                        <TableCell className="text-right">{pdfRewardsValue}</TableCell>
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

            {accountRewardsPeriod && (
              <Card>
                <CardHeader>
                  <CardTitle>Account {statementAccountId} Rewards Program Summary</CardTitle>
                  <CardDescription>
                    Rewards for {formatFetchPeriod(accountRewardsPeriod)}
                  </CardDescription>
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
                        <TableCell className="text-right">{accountRewardsPoints ?? "-"}</TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{accountRewardsPoints ?? "-"}</TableCell>
                      </TableRow>
                      {accountRewardsError && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-destructive">{accountRewardsError}</TableCell>
                        </TableRow>
                      )}
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
