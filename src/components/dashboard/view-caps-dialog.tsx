"use client";

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';

interface CreditCardCap {
  id: string;
  creditCardId: string;
  capName: string;
  capTotalAmount: number;
  capPercentage: number;
  capCurrentAmount: number;
  remainingAmount: number;
}

interface ViewCapsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCardId: string;
  creditCardName: string;
}

export function ViewCapsDialog({
  open,
  onOpenChange,
  creditCardId,
  creditCardName,
}: ViewCapsDialogProps) {
  const [caps, setCaps] = useState<CreditCardCap[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && creditCardId) {
      fetchCaps();
    }
  }, [open, creditCardId]);

  const fetchCaps = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/credit-card-caps?creditCardId=${creditCardId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch caps');
      }
      const data = await response.json();
      setCaps(data.caps || []);
    } catch (error) {
      console.error('Error fetching caps:', error);
      setCaps([]);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateUsagePercentage = (current: number, total: number) => {
    if (total === 0) return 0;
    return (current / total) * 100;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cap Details - {creditCardName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading caps...
          </div>
        ) : caps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No caps found for this credit card.
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cap Name</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-center">Percentage</TableHead>
                  <TableHead>Usage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {caps.map((cap) => {
                  const usagePercentage = calculateUsagePercentage(cap.capCurrentAmount, cap.capTotalAmount);
                  return (
                    <TableRow key={cap.id}>
                      <TableCell className="font-medium">{cap.capName}</TableCell>
                      <TableCell className="text-right">
                        ₹{cap.capTotalAmount.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        ₹{Math.trunc(cap.capCurrentAmount).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        ₹{cap.remainingAmount.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-center">
                        {cap.capPercentage}%
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress 
                            value={usagePercentage} 
                            className="h-2"
                          />
                          <div className="text-xs text-muted-foreground text-center">
                            {usagePercentage.toFixed(1)}% used
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
