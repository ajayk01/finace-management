
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

const expenseSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0.'),
  date: z.date({ required_error: 'A date is required.' }),
  description: z.string().min(1, 'Description is required.'),
  categoryId: z.string().min(1, 'Category is required.'),
  subCategoryId: z.string().min(1, 'Sub-category is required.'),
  includeSplitwise: z.boolean().default(false),
  splitwiseGroupId: z.string().optional(),
  splitwiseUserIds: z.array(z.string()).optional(),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

export interface Category {
  id: string;
  name: string;
}

export interface SubCategory {
  id: string;
  name: string;
  categoryId: string;
}

// Mock data for Splitwise - replace with actual API calls later
const splitwiseGroups = [
    { id: 'g1', name: 'Apartment' },
    { id: 'g2', name: 'Trip to Mountains' },
    { id: 'g3', name: 'Office Lunch' },
];

const splitwiseUsers = [
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
    { id: 'u3', name: 'Charlie' },
    { id: 'u4', name: 'David' },
];


interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  subCategories: SubCategory[];
}

export function AddExpenseDialog({ open, onOpenChange, categories, subCategories }: AddExpenseDialogProps) {
  const { toast } = useToast();
  const [filteredSubCategories, setFilteredSubCategories] = useState<SubCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: 0,
      description: '',
      categoryId: '',
      subCategoryId: '',
      date: new Date(),
      includeSplitwise: false,
      splitwiseGroupId: '',
      splitwiseUserIds: [],
    },
  });

  const selectedCategoryId = form.watch('categoryId');
  const selectedSplitwiseUsers = form.watch('splitwiseUserIds') || [];

  useEffect(() => {
    if (selectedCategoryId) {
      setFilteredSubCategories(
        subCategories.filter((sc) => sc.categoryId === selectedCategoryId)
      );
      form.setValue('subCategoryId', '');
    } else {
      setFilteredSubCategories([]);
    }
  }, [selectedCategoryId, subCategories, form]);

  const handleClose = () => {
    onOpenChange(false);
    // Reset form and step on close
    setTimeout(() => {
      form.reset();
      setStep(1);
    }, 200);
  };

  const onSubmit = async (values: ExpenseFormValues) => {
    setIsLoading(true);
    console.log('Submitting expense:', values);
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    setIsLoading(false);
    toast({
      title: 'Expense Added',
      description: `The new expense of ${values.amount} has been recorded. ${values.includeSplitwise ? 'It will also be added to Splitwise.' : ''}`,
    });
    handleClose();
  };
  
  const handleUserMultiSelect = (userId: string) => {
    const currentSelection = form.getValues('splitwiseUserIds') || [];
    const newSelection = currentSelection.includes(userId)
      ? currentSelection.filter(id => id !== userId)
      : [...currentSelection, userId];
    form.setValue('splitwiseUserIds', newSelection, { shouldValidate: true });
  }

  const handleGoToSplitwise = async () => {
    // Only validate the fields from the first step
    const result = await form.trigger(["amount", "date", "description", "categoryId", "subCategoryId"]);
    if (result) {
      form.setValue('includeSplitwise', true);
      setStep(2);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{step === 1 ? 'Add New Expense' : 'Add Splitwise Details'}</DialogTitle>
          <DialogDescription>
             {step === 1 
               ? "Fill in the details below to add a new expense transaction."
               : "Select the group and users to split this expense with."
             }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {step === 1 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Groceries from store" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Expense Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {categories.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="subCategoryId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Expense Sub-category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCategoryId}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a sub-category" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            {filteredSubCategories.map(subCat => (
                                <SelectItem key={subCat.id} value={subCat.id}>{subCat.name}</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                />
              </div>
            )}

            {step === 2 && (
                <div className="space-y-4 rounded-md border p-4">
                    <FormField
                        control={form.control}
                        name="splitwiseGroupId"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Splitwise Group</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a Splitwise group" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {splitwiseGroups.map(group => (
                                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormItem>
                        <FormLabel>Split with</FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                            <FormControl>
                                <Button
                                variant="outline"
                                className="w-full justify-start font-normal"
                                >
                                <Users className="mr-2 h-4 w-4" />
                                {selectedSplitwiseUsers.length > 0
                                    ? `${selectedSplitwiseUsers.length} user(s) selected`
                                    : 'Select users'}
                                </Button>
                            </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search users..." />
                                <CommandList>
                                <CommandEmpty>No users found.</CommandEmpty>
                                <CommandGroup>
                                    {splitwiseUsers.map((user) => (
                                    <CommandItem
                                        key={user.id}
                                        onSelect={() => handleUserMultiSelect(user.id)}
                                    >
                                        <Checkbox
                                        className="mr-2"
                                        checked={selectedSplitwiseUsers.includes(user.id)}
                                        />
                                        {user.name}
                                    </CommandItem>
                                    ))}
                                </CommandGroup>
                                </CommandList>
                            </Command>
                            </PopoverContent>
                        </Popover>
                        <div className="pt-2">
                            {selectedSplitwiseUsers.map(id => {
                                const user = splitwiseUsers.find(u => u.id === id);
                                return <Badge key={id} variant="secondary" className="mr-1 mb-1">{user?.name}</Badge>
                            })}
                        </div>
                        <FormMessage />
                    </FormItem>
                </div>
            )}
            
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
              {step === 1 && (
                <>
                  <Button type="submit" disabled={isLoading} onClick={() => form.setValue('includeSplitwise', false)}>
                    {isLoading ? 'Adding...' : 'Add Expense'}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleGoToSplitwise}>
                    Next: Add Splitwise
                  </Button>
                </>
              )}
              {step === 2 && (
                 <>
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Adding...' : 'Add Expense & Split'}
                    </Button>
                 </>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Minimal Command components for the multi-select dropdown
const Command = ({children, className}: {children: React.ReactNode, className?: string}) => <div className={cn("flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground", className)}>{children}</div>
const CommandInput = (props: React.ComponentProps<typeof Input>) => <div className='p-2'><Input {...props} className='h-9'/></div>
const CommandList = ({children}: {children: React.ReactNode}) => <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">{children}</div>
const CommandEmpty = ({children}: {children: React.ReactNode}) => <p className='py-6 text-center text-sm'>{children}</p>
const CommandGroup = ({children}: {children: React.ReactNode}) => <div className='p-1'>{children}</div>
const CommandItem = ({children, className, onSelect}: {children: React.ReactNode, className?: string, onSelect: () => void}) => <div onClick={onSelect} className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent", className)}>{children}</div>

    
