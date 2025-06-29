import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown, CreditCard as DefaultCreditCardIcon, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Button } from "@/components/ui/button";

interface StatCardProps {
  title?: string;
  value?: string;
  percentageChange?: number;
  Icon?: LucideIcon;
  isPrimary?: boolean;
  dataAiHint?: string;

  logo?: string;
  bankName?: string;
  currentBalanceText?: string;
  accountNumber?: string;
  onViewTransactions?: () => void;

  creditCardLogoIcon?: string;
  creditCardName?: string;
  usedAmountText?: string;
  totalLimitText?: string;
}

export function StatCard(props: StatCardProps) {
  const {
    title,
    value,
    percentageChange,
    Icon,
    isPrimary = false,
    // Bank specific
    logo: BankLogoIconComponent,
    bankName,
    currentBalanceText,
    accountNumber,
    onViewTransactions,
    // Credit Card specific
    creditCardLogoIcon: CreditCardLogoIconComponentFromProp,
    creditCardName,
    usedAmountText,
    totalLimitText,
  } = props;

  const CreditCardLogoIconComponent = CreditCardLogoIconComponentFromProp || DefaultCreditCardIcon;

  const showCreditCardDetails = !!(
    props.creditCardLogoIcon ||
    creditCardName ||
    usedAmountText ||
    totalLimitText
  );

  const showBankDetails = !showCreditCardDetails && !!(BankLogoIconComponent || bankName || currentBalanceText || accountNumber);
  const showGeneralStats = !showBankDetails && !showCreditCardDetails && !!(title || value || Icon || percentageChange !== undefined);

  const parseTextAndAmount = (textWithAmount: string | undefined) => {
    if (!textWithAmount) return { label: '', amount: '' };
    const parts = textWithAmount.split(' : ');
    return {
      label: parts[0] ? `${parts[0]} :` : '',
      amount: parts[1] || '',
    };
  };

  const usedDetails = parseTextAndAmount(usedAmountText);
  const limitDetails = parseTextAndAmount(totalLimitText);

  return (
    <Card className={cn(
      "shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl",
      "flex flex-col p-4",
    )}>
      {showCreditCardDetails ? (
        <>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
                {props.creditCardLogoIcon && <img
                            src={props.creditCardLogoIcon}
                            alt={creditCardName || "credit_card Logo"}
                            className="h-8 w-8 object-contain"
                          />}
                {creditCardName && <h3 className="text-lg font-semibold text-foreground">{creditCardName}</h3>}
            </div>
             {onViewTransactions && (
              <Button variant="outline" size="sm" onClick={onViewTransactions}>
                View Trans
              </Button>
            )}
          </div>
          <div className="flex-grow">
            {usedAmountText && (
              <p className="text-base font-medium mt-1">
                <span className="text-red-600">{usedDetails.label} </span>
                <span className="text-foreground">₹{usedDetails.amount}</span>
              </p>
            )}
            {totalLimitText && (
              <p className="text-base font-medium mt-1">
                <span className="text-green-500">{limitDetails.label} </span>
                <span className="text-foreground">₹{limitDetails.amount}</span>
              </p>
            )}
          </div>
        </>
      ) : showBankDetails ? (
        <>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              {BankLogoIconComponent && <img
                          src={BankLogoIconComponent}
                          alt={bankName || "Bank Logo"}
                          className="h-8 w-8 object-contain"
                        />
              }
              {bankName && <h3 className="text-lg font-semibold text-foreground">{bankName}</h3>}
            </div>
            {onViewTransactions && (
              <Button variant="outline" size="sm" onClick={onViewTransactions}>
                View Trans
              </Button>
            )}
          </div>
          <div className="flex-grow flex items-end">
            {currentBalanceText ? (
              (() => {
                const parts = currentBalanceText.split(' : ');
                const labelPart = parts[0] ? `${parts[0]} :` : '';
                const valuePart = parts[1] || '';
                return (
                  <p className="text-lg font-semibold mt-1">
                    <span className="text-primary">{labelPart} </span>
                    <span className="text-foreground">₹{valuePart}</span>
                  </p>
                );
              })()
            ) : accountNumber ? (
              <p className="text-sm text-muted-foreground mt-1">
                Account: {accountNumber}
              </p>
            ): null}
          </div>
        </>
      ) : showGeneralStats ? (
        <>
          <CardHeader className={cn(
            "flex flex-row items-center justify-between space-y-0 pb-2 !p-0",
            isPrimary ? "text-primary-foreground" : ""
          )}>
            {title && (
              <CardTitle className={cn(
                "text-sm font-medium",
                isPrimary ? "text-primary-foreground/80" : "text-muted-foreground"
              )}>
                {title}
              </CardTitle>
            )}
            {Icon && (
              isPrimary ? (
                <Icon className="h-5 w-5 text-primary-foreground/80" />
              ) : (
                <div className="p-1.5 rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              )
            )}
          </CardHeader>
          <CardContent className="!p-0 pt-2 flex-grow flex flex-col justify-end">
            {value && (
                <div className={cn(
                  "text-3xl font-bold", 
                  isPrimary ? "text-primary-foreground" : "text-foreground"
                )}>{value}</div>
            )}
            {percentageChange !== undefined && (
              <p className={cn("text-xs flex items-center mt-1",
                isPrimary
                  ? (percentageChange >= 0 ? "text-green-300" : "text-red-300")
                  : (percentageChange >= 0 ? "text-green-500" : "text-red-500")
              )}>
                {percentageChange >= 0 ? (
                  <ArrowUp className="h-4 w-4 mr-1" />
                ) : (
                  <ArrowDown className="h-4 w-4 mr-1" />
                )}
                <span>
                  {Math.abs(percentageChange)}%
                </span>
                <span className="ml-1 text-muted-foreground">This month</span>
              </p>
            )}
          </CardContent>
        </>
      ) : (
        null
      )}
    </Card>
  );
}
