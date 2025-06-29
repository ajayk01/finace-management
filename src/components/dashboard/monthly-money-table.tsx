
"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FinancialSnapshotItem {
  category: string;
  amount: number;
  colorClassName?: string;
}

interface MonthOption {
  value: string;
  label: string;
}

interface YearOption {
  value: number;
  label: string;
}

interface MonthlyMoneyTableProps {
  data: FinancialSnapshotItem[];
  selectedMonth: string;
  onMonthChange: (value: string) => void;
  months: MonthOption[];
  selectedYear: number;
  onYearChange: (value: number) => void;
  years: YearOption[];
}

const formatCurrency = (amount: number | undefined): string => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    // Handles undefined, null (if it could get here via 'any' type), and NaN
    return '₹ --.--'; 
  }
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function MonthlyMoneyTable({
  data,
  selectedMonth,
  onMonthChange,
  months,
  selectedYear,
  onYearChange,
  years,
}: MonthlyMoneyTableProps) {
  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="flex flex-col items-start gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <CardTitle className="text-xl font-semibold whitespace-nowrap">
          Month Netflow
        </CardTitle>
        <div className="flex flex-col space-y-2 w-full sm:flex-row sm:space-x-2 sm:space-y-0 sm:w-auto sm:min-w-[180px] flex-shrink-0">
          <Select value={selectedMonth} onValueChange={onMonthChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedYear.toString()}
            onValueChange={(value) => onYearChange(parseInt(value, 10))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year.value} value={year.value.toString()}>
                  {year.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="py-3 px-4">Category</TableHead>
              <TableHead className="text-right py-3 px-4">Total Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length > 0 ? (
              data.map((item) => (
                <TableRow key={item.category}>
                  <TableCell className="font-medium py-3 px-4">{item.category}</TableCell>
                  <TableCell className={cn("text-right py-3 px-4", item.colorClassName)}>
                    {formatCurrency(item.amount)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-10 text-muted-foreground">
                  No data available for the selected month and year.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
