
'use server';

import { NextRequest, NextResponse } from 'next/server';
import xirr from 'xirr';
import { query, TransactionType } from '@/lib/db';
import type { Account } from '@/types/database';

export async function POST(request: NextRequest) {
    try {
        const { investmentAccountId } = await request.json();

        if (!investmentAccountId) {
            return NextResponse.json({ error: 'Investment Account ID is required.' }, { status: 400 });
        }

        const accountId = parseInt(investmentAccountId);
        if (isNaN(accountId)) {
            return NextResponse.json({ error: 'Invalid Investment Account ID.' }, { status: 400 });
        }

        // 1. Fetch all investment transactions for the given account
        const transactionsSql = `
            SELECT AMOUNT, DATE
            FROM Transactions
            WHERE TO_ACCOUNT_ID = ?
                AND TRANSCATION_TYPE = ?
            ORDER BY DATE ASC
        `;

        const transactionRows = await query<{
            AMOUNT: number;
            DATE: number;
        }>(transactionsSql, [accountId, TransactionType.INVESTMENT]);

        if (transactionRows.length === 0) {
            return NextResponse.json({ error: 'No transactions found for this investment account.' }, { status: 400 });
        }

        // Map to XIRR format: investments are cash outflows (negative)
        const transactions = transactionRows.map((row: any) => ({
            amount: -Math.abs(Number(row.AMOUNT)), // Investments are cash outflows (negative)
            when: new Date(row.DATE), // Convert epoch milliseconds to Date
        }));

        if (transactions.length < 1) {
            return NextResponse.json({ error: 'At least one transaction is required to calculate XIRR.' }, { status: 400 });
        }

        // 2. Fetch the current value of the investment account
        const accountSql = `
            SELECT CURRENT_BALANCE
            FROM Accounts
            WHERE ID = ?
        `;

        const accountRows = await query<Account>(accountSql, [accountId]);

        if (accountRows.length === 0) {
            return NextResponse.json({ error: 'Investment account not found.' }, { status: 404 });
        }

        const currentValue = Number(accountRows[0].CURRENT_BALANCE) || 0;

        // 3. Add the current value as the final "cash flow" transaction
        const today = new Date();
        const lastTransactionDate = transactions[transactions.length - 1].when;
        
        // Ensure current value date is at least 1 day after the last transaction
        const currentValueDate = new Date(Math.max(today.getTime(), lastTransactionDate.getTime() + 24 * 60 * 60 * 1000));
        
        transactions.push({
            amount: currentValue, // Current value is a cash inflow (positive)
            when: currentValueDate,
        });

        // 4. Calculate XIRR
        // The xirr library can throw an error if it can't find a root
        try {
            const result = xirr(transactions);
            console.log(`XIRR calculated for account ${accountId}: ${result}`);
            return NextResponse.json({ xirr: result });
        } catch (e) {
            console.error("XIRR calculation error:", e);
            const errorMessage = e instanceof Error ? e.message : "Unknown error";
            // This error often means no solution could be found, which can happen with unusual cash flows.
            return NextResponse.json({ 
                error: `Could not calculate XIRR: ${errorMessage}. Ensure transactions span multiple days and have valid cash flows.` 
            }, { status: 400 });
        }

    } catch (error) {
        console.error('Error calculating XIRR:', error);
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }
}
