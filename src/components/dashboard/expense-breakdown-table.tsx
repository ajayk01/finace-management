
"use client"

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PieChart as PieChartIcon, Calculator } from "lucide-react";
import { ExpensePieChart } from "./expense-pie-chart";

interface ExpenseItem {
  year: number;
  month: string;
  category: string;
  subCategory: string;
  expense: string;
  xirr?: number; // Add XIRR as optional property
}

interface MonthOption {
  value: string;
  label: string;
}

interface YearOption {
  value: number;
  label: string;
}

interface ExpenseBreakdownTableProps {
  title: string;
  selectedMonth?: string;
  onMonthChange?: (value: string) => void;
  months?: MonthOption[];
  selectedYear?: number;
  onYearChange?: (value: number) => void;
  years?: YearOption[];
  data: ExpenseItem[];
  amountColumnHeaderText?: string;
  amountColumnItemTextColorClassName?: string;
  categoryTotalTextColorClassName?: string;
  grandTotalTextColorClassName?: string;
  showSubCategoryColumn?: boolean;
  showCategoryTotalRow?: boolean;
  showXirrColumn?: boolean; // Add XIRR column toggle
  isXirrLoading?: boolean; // Add loading state for XIRR
  hasXirrBeenCalculated?: boolean; // Add state to track if XIRR has been calculated
  onViewTransactions?: () => void;
  onOpenCalculators?: () => void;
}

interface CategorizedExpenseGroup {
  categoryName: string;
  items: ExpenseItem[];
  categoryTotal: number;
}

const parseCurrency = (currencyStr: string): number => {
  if (!currencyStr) return 0;
  return parseFloat(currencyStr.replace('₹', '').replace(/,/g, ''));
};

export function ExpenseBreakdownTable({
  title,
  selectedMonth,
  onMonthChange,
  months,
  selectedYear,
  onYearChange,
  years,
  data,
  amountColumnHeaderText = "Expense",
  amountColumnItemTextColorClassName = "text-red-600 font-medium",
  categoryTotalTextColorClassName = "text-red-700 font-semibold",
  grandTotalTextColorClassName = "text-red-700",
  showSubCategoryColumn = false,
  showCategoryTotalRow = true,
  showXirrColumn = false,
  isXirrLoading = false,
  hasXirrBeenCalculated = false,
  onViewTransactions,
  onOpenCalculators,
}: ExpenseBreakdownTableProps) {

  const [viewMode, setViewMode] = React.useState<'table' | 'chart'>('table');

  const { categorizedData, grandTotal } = React.useMemo(() => {
    if (!data || data.length === 0) {
      return { categorizedData: [], grandTotal: 0 };
    }

    const categoriesMap = new Map<string, { items: ExpenseItem[], total: number }>();
    let calculatedGrandTotal = 0;

    data.forEach(item => {
      const expenseValue = parseCurrency(item.expense);
      if (!categoriesMap.has(item.category)) {
        categoriesMap.set(item.category, { items: [], total: 0 });
      }
      const categoryGroup = categoriesMap.get(item.category)!;
      categoryGroup.items.push(item);
      categoryGroup.total += expenseValue;
      calculatedGrandTotal += expenseValue;
    });

    // Convert map to array and sort sub-items within each category
    let processedCategorizedData = Array.from(categoriesMap.entries()).map(([categoryName, groupData]) => ({
      categoryName,
      // Sort sub-category items by expense amount (descending), then by subCategory name (ascending)
      items: groupData.items.sort((a, b) => {
        const expenseA = parseCurrency(a.expense);
        const expenseB = parseCurrency(b.expense);
        if (expenseB !== expenseA) {
          return expenseB - expenseA; // Descending by expense amount
        }
        return a.subCategory.localeCompare(b.subCategory); // Ascending by subCategory name for tie-breaking
      }),
      categoryTotal: groupData.total,
    }));

    // Sort categories by their total amount (descending), then by category name (ascending) for tie-breaking
    processedCategorizedData.sort((a, b) => {
      if (b.categoryTotal !== a.categoryTotal) {
        return b.categoryTotal - a.categoryTotal; // Descending by category total
      }
      return a.categoryName.localeCompare(b.categoryName); // Ascending by category name for tie-breaking
    });

    return { categorizedData: processedCategorizedData, grandTotal: calculatedGrandTotal };
  }, [data]);
  
  const pieChartData = React.useMemo(() => {
      if (viewMode === 'table') return [];
      return categorizedData.map(group => ({
          name: group.categoryName,
          value: group.categoryTotal,
      }));
  }, [categorizedData, viewMode]);

  const showSelectors = selectedMonth && onMonthChange && months && selectedYear !== undefined && onYearChange && years;

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="flex flex-col items-start gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <CardTitle className="text-xl font-semibold whitespace-nowrap">{title}</CardTitle>
        <div className="flex flex-col space-y-2 w-full sm:flex-row sm:space-x-3 sm:space-y-0 sm:w-auto flex-shrink-0">
            {onViewTransactions && (
                <Button variant="outline" size="sm" onClick={onViewTransactions}>View Transactions</Button>
            )}
            {onOpenCalculators && (
                <Button variant="outline" size="sm" onClick={onOpenCalculators}>
                  <Calculator className="mr-2 h-4 w-4" />
                  {showXirrColumn ? 'Calculate XIRR' : 'Calculators'}
                </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setViewMode(prev => prev === 'table' ? 'chart' : 'table')}>
                <PieChartIcon className="mr-2 h-4 w-4" />
                {viewMode === 'table' ? 'Chart' : 'Table'}
            </Button>
            {showSelectors && (
              <>
                <Select value={selectedMonth} onValueChange={(value) => { onMonthChange(value); setViewMode('table'); }}>
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
                  onValueChange={(value) => { onYearChange(parseInt(value, 10)); setViewMode('table'); }}
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
              </>
            )}
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'table' ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-3 px-4">Category</TableHead>
                {showSubCategoryColumn && <TableHead className="py-3 px-4">Sub-category</TableHead>}
                <TableHead className="text-right py-3 px-4">{amountColumnHeaderText}</TableHead>
                {showXirrColumn && <TableHead className="text-right py-3 px-4">XIRR (%)</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorizedData.length > 0 ? (
                categorizedData.map((group) => (
                  <React.Fragment key={group.categoryName}>
                    {group.items.map((item, itemIndex) => (
                      <TableRow key={`${item.year}-${item.month}-${item.category}-${item.subCategory}-${itemIndex}`}>
                        <TableCell className="font-medium py-3 px-4">{item.category}</TableCell>
                        {showSubCategoryColumn && <TableCell className="py-3 px-4">{item.subCategory}</TableCell>}
                        <TableCell className={cn("text-right py-3 px-4", amountColumnItemTextColorClassName)}>
                          ₹{parseCurrency(item.expense).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        {showXirrColumn && (
                          <TableCell className="text-right py-3 px-4">
                            {item.xirr !== undefined ? (
                              <span className={item.xirr >= 0 ? "text-green-600" : "text-red-600"}>
                                {item.xirr.toFixed(2)}%
                              </span>
                            ) : isXirrLoading ? (
                              <span className="text-muted-foreground animate-pulse">
                                Calculating...
                              </span>
                            ) : hasXirrBeenCalculated ? (
                              <span className="text-muted-foreground text-xs">
                                No data
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                N/A
                              </span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {showCategoryTotalRow && (
                      <TableRow className="bg-muted/50">
                        {showSubCategoryColumn ? (
                          <>
                            <TableCell className="py-2 px-4 font-semibold"></TableCell>
                            <TableCell className="py-2 px-4 font-semibold text-right">{group.categoryName} Total</TableCell>
                          </>
                        ) : (
                          <TableCell className="py-2 px-4 font-semibold text-right">{group.categoryName} Total</TableCell>
                        )}
                        <TableCell className={cn("text-right py-2 px-4", categoryTotalTextColorClassName)}>
                          ₹{group.categoryTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        {showXirrColumn && <TableCell className="py-2 px-4"></TableCell>}
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={showSubCategoryColumn ? (showXirrColumn ? 4 : 3) : (showXirrColumn ? 3 : 2)} className="text-center py-10 text-muted-foreground">
                    No data recorded for the selected month and year.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {categorizedData.length > 0 && (
              <TableFooter>
                <TableRow className="bg-card font-bold text-base">
                  <TableCell colSpan={showSubCategoryColumn ? 2 : 1} className="text-right py-3 px-4">Grand Total</TableCell>
                  <TableCell className={cn("text-right py-3 px-4", grandTotalTextColorClassName)}>
                    ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  {showXirrColumn && <TableCell className="py-3 px-4"></TableCell>}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        ) : (
            <ExpensePieChart data={pieChartData} chartTitle="" chartDescription="" />
        )}
      </CardContent>
    </Card>
  );
}