
"use client"

import * as React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const COLORS = ['#3B82F6', '#8B5CF6', '#A78BFA', '#F59E0B', '#EF4444', '#B91C1C', '#DC2626', '#10B981', '#6366F1', '#F97316'];

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, outerRadius, percent, index, value, name, fill }: any) => {
  const sin = Math.sin(-midAngle * RADIAN);
  const cos = Math.cos(-midAngle * RADIAN);

  const sx = cx + outerRadius * cos;
  const sy = cy + outerRadius * sin;
  const mx = cx + (outerRadius + 15) * cos;
  const my = cy + (outerRadius + 15) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 30;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';
  const labelColor = fill;

  let formattedValue: string;
  if (value === 0) {
    formattedValue = '₹0';
  } else if (value < 1000) {
    formattedValue = `₹${value.toFixed(0)}`;
  } else if (value % 1000 === 0) {
    formattedValue = `₹${(value / 1000).toFixed(0)}K`;
  } else {
    formattedValue = `₹${(value / 1000).toFixed(1)}K`;
  }
  
  if (value === 0 || !isFinite(sx) || !isFinite(sy)) return null;


  return (
    <g>
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={labelColor} fill="none" strokeWidth={1.5} />
      <text x={ex + (cos >= 0 ? 1 : -1) * 8} y={ey} textAnchor={textAnchor} fill="hsl(var(--foreground))" dominantBaseline="central">
        <tspan x={ex + (cos >= 0 ? 1 : -1) * 8} dy="-0.5em" className="font-semibold text-sm">
          {formattedValue}
        </tspan>
        <tspan x={ex + (cos >= 0 ? 1 : -1) * 8} dy="1.1em" className="text-[11px] text-muted-foreground">
          {name}
        </tspan>
      </text>
    </g>
  );
};

interface PieChartDataItem {
  name: string;
  value: number;
}

interface ExpensePieChartProps {
  data: PieChartDataItem[];
  chartTitle?: string;
  chartDescription?: string;
}

export function ExpensePieChart({ 
  data, 
  chartTitle = "Selected Month expense", 
  chartDescription = "Breakdown By Category" 
}: ExpensePieChartProps) {
  
  const chartData = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Sort by value descending to know large and small items
    const sorted = [...data].sort((a, b) => b.value - a.value);
    
    // Interleave them to spread small slices out
    const interleaved = [];
    let left = 0;
    let right = sorted.length - 1;
    while (left <= right) {
      if (left <= right) {
        interleaved.push(sorted[left]);
        left++;
      }
      if (left <= right) {
        interleaved.push(sorted[right]);
        right--;
      }
    }
    return interleaved;
  }, [data]);

  const totalAmount = chartData.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="items-center pb-3">
        <CardTitle className="text-2xl font-bold">{chartTitle}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">{chartDescription}</CardDescription>
      </CardHeader>
      <CardContent className="h-[320px] sm:h-[380px] relative">
        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 30, right: 60, bottom: 30, left: 60 }}>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius={110}
                  innerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={1}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-3xl font-bold text-foreground -translate-y-3">
                ₹{(totalAmount / 1000).toFixed(1)}K
              </p>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-lg text-muted-foreground">
              No data for the selected month and year.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

