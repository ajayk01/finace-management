
"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartTooltipContent } from "@/components/ui/chart" // Assuming ChartContainer and ChartConfig are not strictly needed for basic charts

const data = [
  { month: "Jan", profit: 18000, loss: 12000 },
  { month: "Feb", profit: 22000, loss: 15000 },
  { month: "Mar", profit: 19000, loss: 10000 },
  { month: "Apr", profit: 17000, loss: 13000 },
  { month: "May", profit: 25000, loss: 12000 },
  { month: "Jun", profit: 21000, loss: 14000 },
  { month: "Jul", profit: 18000, loss: 11000 },
  { month: "Aug", profit: 22000, loss: 13000 },
]

export function ProfitLossChart() {
  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 col-span-1 lg:col-span-2">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Profit and Loss</CardTitle>
          {/* Placeholder for MoreHorizontal icon if needed */}
        </div>
      </CardHeader>
      <CardContent className="h-[300px] md:h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 0, left: -25, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis 
              tickFormatter={(value) => `${value / 1000}k`} 
              tickLine={false} 
              axisLine={false} 
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              }}
              cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
            />
            <Legend iconType="circle" iconSize={10} wrapperStyle={{paddingTop: '10px'}}/>
            <Bar dataKey="profit" fill="hsl(var(--chart-1))" name="Profit" radius={[4, 4, 0, 0]} barSize={15}/>
            <Bar dataKey="loss" fill="hsl(var(--chart-2))" name="Loss" radius={[4, 4, 0, 0]} barSize={15}/>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
