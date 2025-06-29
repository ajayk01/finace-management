
"use client"

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceDot } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const data = [
  { month: "Jan", revenue: 20000, expenses: 15000 },
  { month: "Feb", revenue: 22000, expenses: 16000 },
  { month: "Mar", revenue: 25000, expenses: 18000 },
  { month: "Apr", revenue: 23000, expenses: 17000 },
  { month: "May", revenue: 28000, expenses: 19000 },
  { month: "Jun", revenue: 30000, expenses: 20000 },
  { month: "Jul", revenue: 32000, expenses: 22000, todayRevenue: 720 }, // Highlighted point
  { month: "Aug", revenue: 29000, expenses: 21000 },
  { month: "Sep", revenue: 27000, expenses: 19000 },
  { month: "Oct", revenue: 31000, expenses: 23000 },
  { month: "Nov", revenue: 33000, expenses: 24000 },
]

export function RevenueExpensesChart() {
  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 col-span-1 lg:col-span-3">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <CardTitle>Revenue and Expenses Over Time</CardTitle>
          <Select defaultValue="this-week">
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-week">This week</SelectItem>
              <SelectItem value="this-month">This month</SelectItem>
              <SelectItem value="this-year">This year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="h-[250px] md:h-[300px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis 
              tickFormatter={(value) => `${value / 1000}k`} 
              tickLine={false} 
              axisLine={false} 
              fontSize={12}
              domain={['dataMin - 2000', 'dataMax + 2000']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              }}
              cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Legend iconType="circle" iconSize={10} wrapperStyle={{paddingTop: '10px'}}/>
            <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} name="Revenue"/>
            <Line type="monotone" dataKey="expenses" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} name="Expenses"/>
            
            {data.map((entry, index) => (
              entry.month === "Jul" && entry.todayRevenue ? (
                <ReferenceDot 
                  key={`ref-dot-${index}`}
                  x={entry.month} 
                  y={entry.revenue} 
                  r={8} 
                  fill="hsl(var(--primary))" 
                  stroke="hsl(var(--card))" 
                  strokeWidth={2}
                  isFront={true} 
                />
              ) : null
            ))}
          </LineChart>
        </ResponsiveContainer>
        {/* Overlay for "Today Revenue" */}
        {/* This specific element is hard to place precisely with recharts without custom logic */}
        {/* A simplified approach might be to show it in a tooltip or a separate card */}
        <div className="absolute top-1/4 right-1/4 sm:right-1/3 md:right-1/4 lg:right-[30%] transform translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md shadow-lg text-xs">
            Today Revenue <span className="font-bold">$720</span>
        </div>
      </CardContent>
    </Card>
  )
}
