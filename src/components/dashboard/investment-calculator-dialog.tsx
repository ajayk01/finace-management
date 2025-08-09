
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

interface InvestmentCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investmentAccounts: InvestmentCategory[];
}

const calculatorTypes = [
    { id: 'sip', name: 'SIP Calculator' },
    { id: 'lumpsum', name: 'Lump Sum Calculator' },
    { id: 'retirement', name: 'Retirement Calculator' },
];

export function InvestmentCalculatorDialog({ open, onOpenChange, investmentAccounts }: InvestmentCalculatorDialogProps) {
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedCalculator, setSelectedCalculator] = useState('');

  const handleCalculate = () => {
    if (!selectedAccount || !selectedCalculator) {
      toast({
        variant: "destructive",
        title: "Selection Missing",
        description: "Please select both an account and a calculator type.",
      });
      return;
    }
    // Placeholder for actual calculation logic
    toast({
      title: "Calculation in Progress",
      description: `Calculating using ${calculatorTypes.find(c => c.id === selectedCalculator)?.name} for ${investmentAccounts.find(a => a.id === selectedAccount)?.name}.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Investment Calculators</DialogTitle>
          <DialogDescription>
            Select an account and a calculator to get started.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="investment-account">Investment Account</Label>
                <Select onValueChange={setSelectedAccount} value={selectedAccount}>
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
            <div className="space-y-2">
                <Label htmlFor="calculator-type">Calculator Type</Label>
                <Select onValueChange={setSelectedCalculator} value={selectedCalculator}>
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
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleCalculate}>Calculate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}