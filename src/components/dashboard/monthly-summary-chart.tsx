
"use client";

import * as React from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface ChartDataItem {
  month: string;
  expense: number;
  income: number;
  investment: number;
}

interface YearOption {
  value: number;
  label: string;
}

interface MonthlySummaryChartProps {
  data: ChartDataItem[];
  selectedYear: number;
  onYearChange: (value: number) => void;
  years: YearOption[];
}

const lineColors = {
  expense: "hsl(var(--chart-2))", // Red
  income: "hsl(var(--chart-1))",   // Green
  investment: "hsl(var(--primary))", // Blue
};

const CustomTooltipContent = ({ active, payload, label }: ComponentProps<typeof Tooltip>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card p-3 border rounded-md shadow-lg">
        <p className="label font-semibold text-sm text-foreground mb-1">{`${label} ${payload[0]?.payload?.year || ''}`}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} style={{ color: entry.color }} className="text-xs">
            {`${entry.name}: ₹${(entry.value as number).toLocaleString()}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};


export function MonthlySummaryChart({ data, selectedYear, onYearChange, years }: MonthlySummaryChartProps) {
  const chartDataWithYear = data.map(d => ({ ...d, year: selectedYear }));
  const hasData = chartDataWithYear.some(d => d.expense > 0 || d.income > 0 || d.investment > 0);
  
  const [visibility, setVisibility] = React.useState({
    expense: true,
    income: true,
    investment: true,
  });
  
  type VisibilityKey = keyof typeof visibility;

  const handleLegendClick = (e: { dataKey: VisibilityKey }) => {
    const { dataKey } = e;
    setVisibility(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey],
    }));
  };
  
  const renderLegendText = (value: string, entry: any) => {
    const { dataKey } = entry.payload;
    const isActive = visibility[dataKey as VisibilityKey];
    return (
      <span
        className={cn(
          "transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground line-through"
        )}
      >
        {value}
      </span>
    );
  };


  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="flex flex-row items-center justify-between space-x-2 pb-4">
        <div className="flex-1"></div>
        <div className="flex space-x-2 min-w-[100px] flex-shrink-0">
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
      <CardContent className="h-[350px] md:h-[400px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataWithYear} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                tickFormatter={(value) => value === 0 ? "₹0" : `₹${value / 1000}k`}
                tickLine={false}
                axisLine={false}
                fontSize={12}
                allowDecimals={false}
                width={70}
              />
              <Tooltip content={<CustomTooltipContent />} cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 2, strokeDasharray: '3 3' }} />
              <Legend 
                iconType="circle" 
                iconSize={10} 
                wrapperStyle={{ paddingTop: '15px', cursor: 'pointer' }}
                onClick={handleLegendClick}
                formatter={renderLegendText}
              />
              <Line hide={!visibility.expense} type="monotone" dataKey="expense" name="Expenses" stroke={lineColors.expense} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              <Line hide={!visibility.income} type="monotone" dataKey="income" name="Income" stroke={lineColors.income} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              <Line hide={!visibility.investment} type="monotone" dataKey="investment" name="Investments" stroke={lineColors.investment} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No summary data available for the selected year.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
