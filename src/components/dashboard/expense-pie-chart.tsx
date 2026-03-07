
"use client"

import * as React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const COLORS = ['#3B82F6', '#8B5CF6', '#A78BFA', '#F59E0B', '#EF4444', '#B91C1C', '#DC2626', '#10B981', '#6366F1', '#F97316'];

const RADIAN = Math.PI / 180;
const LABEL_EXTEND = 18;
const LINE_EXTEND = 28;
const MIN_LABEL_SPACING = 26;

const formatValue = (value: number): string => {
  if (value === 0) return '₹0';
  if (value < 1000) return `₹${value.toFixed(0)}`;
  if (value % 1000 === 0) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${(value / 1000).toFixed(1)}K`;
};

interface LabelInfo {
  idx: number;
  cos: number;
  sin: number;
  side: 'left' | 'right';
  initialY: number;
  adjustedY: number;
}

function resolveCollisions(group: LabelInfo[], outerRadius: number) {
  if (group.length <= 1) return;

  group.sort((a, b) => a.adjustedY - b.adjustedY);

  // Forward pass: push labels apart to maintain minimum spacing
  for (let i = 1; i < group.length; i++) {
    if (group[i].adjustedY - group[i - 1].adjustedY < MIN_LABEL_SPACING) {
      group[i].adjustedY = group[i - 1].adjustedY + MIN_LABEL_SPACING;
    }
  }

  // Recenter: shift group to preserve average y position
  const avgInitial = group.reduce((s, l) => s + l.initialY, 0) / group.length;
  const avgAdjusted = group.reduce((s, l) => s + l.adjustedY, 0) / group.length;
  const shift = avgInitial - avgAdjusted;
  group.forEach(l => (l.adjustedY += shift));

  // Re-sort and re-resolve after centering
  group.sort((a, b) => a.adjustedY - b.adjustedY);
  for (let i = 1; i < group.length; i++) {
    if (group[i].adjustedY - group[i - 1].adjustedY < MIN_LABEL_SPACING) {
      group[i].adjustedY = group[i - 1].adjustedY + MIN_LABEL_SPACING;
    }
  }

  // Backward pass: pull labels up if needed
  for (let i = group.length - 2; i >= 0; i--) {
    if (group[i + 1].adjustedY - group[i].adjustedY < MIN_LABEL_SPACING) {
      group[i].adjustedY = group[i + 1].adjustedY - MIN_LABEL_SPACING;
    }
  }

  // Clamp within reasonable bounds
  const maxY = outerRadius + 60;
  const minY = -(outerRadius + 60);
  if (group[group.length - 1].adjustedY > maxY) {
    group[group.length - 1].adjustedY = maxY;
    for (let i = group.length - 2; i >= 0; i--) {
      if (group[i + 1].adjustedY - group[i].adjustedY < MIN_LABEL_SPACING) {
        group[i].adjustedY = group[i + 1].adjustedY - MIN_LABEL_SPACING;
      }
    }
  }
  if (group[0].adjustedY < minY) {
    group[0].adjustedY = minY;
    for (let i = 1; i < group.length; i++) {
      if (group[i].adjustedY - group[i - 1].adjustedY < MIN_LABEL_SPACING) {
        group[i].adjustedY = group[i - 1].adjustedY + MIN_LABEL_SPACING;
      }
    }
  }
}

function computeAdjustedPositions(
  data: { name: string; value: number }[],
  outerRadius: number,
  paddingAngle: number
): Map<number, number> {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return new Map();

  const activeCount = data.filter(d => d.value > 0).length;
  const availableAngle = 360 - activeCount * paddingAngle;
  const labelRadius = outerRadius + LABEL_EXTEND;

  let cumAngle = paddingAngle / 2;
  const labels: LabelInfo[] = [];

  data.forEach((entry, i) => {
    if (entry.value <= 0) return;

    const sliceAngle = (entry.value / total) * availableAngle;
    const midAngle = cumAngle + sliceAngle / 2;
    cumAngle += sliceAngle + paddingAngle;

    const cos = Math.cos(-midAngle * RADIAN);
    const sin = Math.sin(-midAngle * RADIAN);
    const yPos = labelRadius * sin;

    labels.push({
      idx: i,
      cos,
      sin,
      side: cos >= 0 ? 'right' : 'left',
      initialY: yPos,
      adjustedY: yPos,
    });
  });

  const rightLabels = labels.filter(l => l.side === 'right');
  const leftLabels = labels.filter(l => l.side === 'left');

  resolveCollisions(rightLabels, outerRadius);
  resolveCollisions(leftLabels, outerRadius);

  const result = new Map<number, number>();
  [...rightLabels, ...leftLabels].forEach(l => result.set(l.idx, l.adjustedY));
  return result;
}

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
    const interleaved: PieChartDataItem[] = [];
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

  const PIE_OUTER_RADIUS = 100;
  const PIE_INNER_RADIUS = 70;
  const PADDING_ANGLE = 1;

  const adjustedYMap = React.useMemo(
    () => computeAdjustedPositions(chartData, PIE_OUTER_RADIUS, PADDING_ANGLE),
    [chartData]
  );

  const totalAmount = chartData.reduce((sum, entry) => sum + entry.value, 0);

  const renderLabel = React.useCallback(
    ({ cx, cy, midAngle, outerRadius: or, index, value, name, fill }: any) => {
      if (value === 0 || !isFinite(cx) || !isFinite(cy)) return null;

      const cos = Math.cos(-midAngle * RADIAN);
      const sin = Math.sin(-midAngle * RADIAN);

      // Point on the pie edge
      const sx = cx + or * cos;
      const sy = cy + or * sin;

      // Adjusted label y position (relative to cy)
      const adjustedYOffset = adjustedYMap.get(index);
      const defaultY = (or + LABEL_EXTEND) * sin;
      const labelY = cy + (adjustedYOffset !== undefined ? adjustedYOffset : defaultY);

      const direction = cos >= 0 ? 1 : -1;
      const elbowX = cx + direction * (or + LABEL_EXTEND);
      const ex = elbowX + direction * LINE_EXTEND;

      const formattedValue = formatValue(value);
      const textAnchor = cos >= 0 ? 'start' : 'end';

      return (
        <g>
          <path
            d={`M${sx},${sy}L${elbowX},${labelY}L${ex},${labelY}`}
            stroke={fill}
            fill="none"
            strokeWidth={1.5}
          />
          <text
            x={ex + direction * 6}
            y={labelY}
            textAnchor={textAnchor}
            fill="hsl(var(--foreground))"
            dominantBaseline="central"
          >
            <tspan x={ex + direction * 6} dy="-0.5em" className="font-semibold text-sm">
              {formattedValue}
            </tspan>
            <tspan x={ex + direction * 6} dy="1.1em" className="text-[11px] text-muted-foreground">
              {name}
            </tspan>
          </text>
        </g>
      );
    },
    [adjustedYMap]
  );

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="items-center pb-3">
        <CardTitle className="text-2xl font-bold">{chartTitle}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">{chartDescription}</CardDescription>
      </CardHeader>
      <CardContent className="h-[380px] sm:h-[450px] relative">
        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 40, right: 80, bottom: 40, left: 80 }}>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderLabel}
                  outerRadius={PIE_OUTER_RADIUS}
                  innerRadius={PIE_INNER_RADIUS}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={PADDING_ANGLE}
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

