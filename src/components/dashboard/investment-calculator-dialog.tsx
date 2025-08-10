
"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { InvestmentCategory } from './add-investment-dialog';
import { Label } from '../ui/label';
import { Loader2 } from 'lucide-react';

interface InvestmentCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investmentAccounts: InvestmentCategory[];
  onXirrCalculated?: (accountId: string, xirr: number) => void;
}

const calculatorTypes = [
    { id: 'xirr', name: 'XIRR Calculator' },
];

export function InvestmentCalculatorDialog({ open, onOpenChange, investmentAccounts, onXirrCalculated }: InvestmentCalculatorDialogProps) {
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedCalculator, setSelectedCalculator] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCalculate = async () => {
    if (!selectedCalculator) {
      toast({
        variant: "destructive",
        title: "Selection Missing",
        description: "Please select a calculator type.",
      });
      return;
    }

    if (selectedCalculator === 'xirr' && !selectedAccount) {
      toast({
        variant: "destructive",
        title: "Selection Missing",
        description: "Please select an investment account.",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Calculate XIRR for single account
      const response = await fetch('/api/calculate-xirr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investmentAccountId: selectedAccount }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to calculate XIRR.');
      }
      
      const accountName = investmentAccounts.find(a => a.id === selectedAccount)?.name;
      
      // Update the parent component with the calculated XIRR
      if (onXirrCalculated && result.hasOwnProperty('xirr')) {
        onXirrCalculated(selectedAccount, result.xirr * 100); // Convert to percentage
      }
      
      toast({
        title: "XIRR Calculation Successful",
        description: `The XIRR for ${accountName} is ${(result.xirr * 100).toFixed(2)}%.`,
      });
      onOpenChange(false);

    } catch (error) {
       toast({
        variant: "destructive",
        title: "Calculation Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDialogClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedAccount('');
      setSelectedCalculator('');
      setIsLoading(false);
    }
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Investment Calculators</DialogTitle>
          <DialogDescription>
            Select an account and a calculator to get started.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="calculator-type">Calculator Type</Label>
                <Select onValueChange={setSelectedCalculator} value={selectedCalculator} disabled={isLoading}>
                    <SelectTrigger id="calculator-type">
                        <SelectValue placeholder="Select a calculator" />
                    </SelectTrigger>
                    <SelectContent>
                        {calculatorTypes.map(calc => (
                            <SelectItem key={calc.id} value={calc.id}>{calc.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {selectedCalculator === 'xirr' && (
                <div className="space-y-2">
                    <Label htmlFor="investment-account">Investment Account</Label>
                    <Select onValueChange={setSelectedAccount} value={selectedAccount} disabled={isLoading}>
                        <SelectTrigger id="investment-account">
                            <SelectValue placeholder="Select an account" />
                        </SelectTrigger>
                        <SelectContent>
                            {investmentAccounts.map(account => (
                                <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {selectedCalculator === 'xirr-all' && (
                <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">
                        This will calculate XIRR for all {investmentAccounts.length} investment accounts.
                    </p>
                </div>
            )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancel</Button>
          <Button type="button" onClick={handleCalculate} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Calculating...' : 'Calculate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
