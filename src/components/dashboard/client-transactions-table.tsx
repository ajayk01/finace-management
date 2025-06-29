
"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MoreHorizontal } from "lucide-react"

const transactions = [
  { id: "#1588", clientName: "Ralph Edwards", date: "9/23/16", type: "Payment", amount: "$396.84", status: "success" },
  { id: "#1588", clientName: "Darrell Steward", date: "5/7/16", type: "Refund", amount: "$169.43", status: "destructive" },
  { id: "#1589", clientName: "Jane Cooper", date: "8/15/16", type: "Payment", amount: "$250.00", status: "success" },
  { id: "#1590", clientName: "Wade Warren", date: "7/02/16", type: "Payment", amount: "$420.50", status: "success" },
  { id: "#1591", clientName: "Esther Howard", date: "6/11/16", type: "Refund", amount: "$99.00", status: "destructive" },
]

export function ClientTransactionsTable() {
  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 col-span-1 lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Client Transactions Table</CardTitle>
        <Button variant="outline">View Details</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID No:</TableHead>
              <TableHead>Client Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Transaction type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id + transaction.clientName + transaction.date}>
                <TableCell className="font-medium">{transaction.id}</TableCell>
                <TableCell>{transaction.clientName}</TableCell>
                <TableCell>{transaction.date}</TableCell>
                <TableCell>
                  <Badge variant={transaction.status === 'success' ? 'default' : 'destructive'} 
                         className={transaction.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {transaction.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{transaction.amount}</TableCell>
                <TableCell className="text-center">
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
