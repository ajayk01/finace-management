
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, transaction as dbTransaction, TransactionType, AccountType } from '@/lib/db';
import type { SplitwiseFriend } from '@/types/database';

const CURRENT_USER_ID = process.env.SPLITWISE_CURRENT_USER_ID || "57391213"; // Your Splitwise user ID

const userMapping = new Map<string, string>();

// Splitwise API function using pure HTTP requests
async function addSplitwiseExpense({ amount, description, groupId, userIds, splitType, customAmounts }: {
    amount: number;
    description: string;
    groupId: string;
    userIds: string[];
    splitType?: 'equal' | 'custom';
    customAmounts?: Record<string, number>;
}) {
    const SPLITWISE_API_KEY = process.env.SPLITWISE_API_KEY;
    
    if (!SPLITWISE_API_KEY) 
    {
        throw new Error('Splitwise API key not configured');
    }

    // Create form data for Splitwise API
    const formData = new URLSearchParams();
    formData.append('cost', amount.toString());
    formData.append('description', description);
    formData.append('group_id', groupId);
    formData.append('currency_code', 'INR'); // Adjust currency as needed
    formData.append('details', "string");
    
    // Determine if we're using equal split or custom amounts
    const useEqualSplit = splitType === 'equal' || !splitType || !customAmounts;
    formData.append('split_equally', useEqualSplit ? 'true' : 'false');
    
    if (useEqualSplit) {
        // Equal split logic
        const totalUsers = userIds.length;
        const splitAmount = (amount / totalUsers).toFixed(2);
        
        // Current user (who paid the expense)
        formData.append('users__0__user_id', CURRENT_USER_ID);
        formData.append('users__0__paid_share', amount.toString());
        if (userIds.includes(CURRENT_USER_ID)) 
        {
            formData.append('users__0__owed_share', splitAmount);
        } 
        
        userIds.forEach((userId, index) => 
        {
            if(userId.includes(CURRENT_USER_ID)) 
            {
                return;    
            } 
            const userIndex = index + 1;
            formData.append(`users__${userIndex}__user_id`, userId);
            formData.append(`users__${userIndex}__paid_share`, '0.00');
            formData.append(`users__${userIndex}__owed_share`, splitAmount);
        });
    } else {
        // Custom amounts logic
        let userIndex = 0;
        
        // Current user (who paid the expense)
        formData.append(`users__${userIndex}__user_id`, CURRENT_USER_ID);
        formData.append(`users__${userIndex}__paid_share`, amount.toString());
        
        // Set current user's owed share if they're in the split
        if (userIds.includes(CURRENT_USER_ID) && customAmounts[CURRENT_USER_ID]) {
            formData.append(`users__${userIndex}__owed_share`, customAmounts[CURRENT_USER_ID].toFixed(2));
        } else {
            formData.append(`users__${userIndex}__owed_share`, '0.00');
        }
        userIndex++;
        
        // Add other users with their custom amounts
        userIds.forEach((userId) => {
            if(userId.includes(CURRENT_USER_ID)) {
                return;    
            }
            
            const owedAmount = customAmounts[userId] || 0;
            formData.append(`users__${userIndex}__user_id`, userId);
            formData.append(`users__${userIndex}__paid_share`, '0.00');
            formData.append(`users__${userIndex}__owed_share`, owedAmount.toFixed(2));
            userIndex++;
        });
    }

    const response = await fetch('https://secure.splitwise.com/api/v3.0/create_expense', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SPLITWISE_API_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
    });

    const responseText = await response.text();

    if (!response.ok) 
    {
        throw new Error(`Splitwise API failed: ${response.status} - ${responseText}`);
    }

    const result = JSON.parse(responseText);
    if(result.errors && result.errors.base)
    {
        console.error('❌ Splitwise API error:', result.errors.base);
        throw new Error(result.errors.base);
    }
    return result;
}

// Function to create Splitwise user ID to database ID mapping
async function createSplitwiseToDbMapping(): Promise<Map<string, string>> 
{
    try {
        const sql = `
            SELECT ID, NAME, SPLITWISE_FRIEND_ID
            FROM SplitwiseFriends
            WHERE SPLITWISE_FRIEND_ID IS NOT NULL
        `;
        
        const results = await query<SplitwiseFriend>(sql);
        
        results.forEach((friend: SplitwiseFriend) => {
            if (friend.ID && friend.SPLITWISE_FRIEND_ID) {
                // Convert splitwiseUserId to string to match the type from splitwiseUserIds array
                const splitwiseUserIdStr = String(friend.SPLITWISE_FRIEND_ID);
                userMapping.set(splitwiseUserIdStr, friend.ID.toString());
            }
        });
        
        return userMapping;
    } catch (error) {
        console.error('❌ Error fetching Splitwise user mappings:', error);
        return new Map(); // Return empty map on error
    }
}


/**
 * Create expense transaction in database
 */
async function createExpenseTransaction({ 
    amount, 
    date, 
    description, 
    account, 
    categoryId, 
    subCategoryId 
}: {
    amount: number;
    date: string;
    description: string;
    account: { id: string; type: 'Bank' | 'Credit Card' };
    categoryId: string;
    subCategoryId?: string;
}): Promise<number> {
    // Convert date string (YYYY-MM-DD) to epoch time (Unix timestamp in milliseconds, like Java System.currentTimeMillis())
    const epochTime = new Date(date).getTime();
    
    const sql = `
        INSERT INTO Transactions (
            DATE, 
            NOTES, 
            AMOUNT, 
            FROM_ACCOUNT_ID, 
            CATEGORY_ID, 
            SUB_CATEGORY_ID, 
            TRANSCATION_TYPE
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result: any = await query(sql, [
        epochTime,
        description,
        amount,
        parseInt(account.id),
        parseInt(categoryId),
        subCategoryId ? parseInt(subCategoryId) : null,
        TransactionType.EXPENSE
    ]);
    // Extract the inserted ID from the result
    const insertedId = result?.insertId || result?.[0]?.insertId || 0;
    
    console.log(`✅ Created expense transaction with ID: ${insertedId}, date: ${date} (epoch: ${epochTime})`);
    return insertedId;
}

/**
 * Create Splitwise transaction record in database
 */
async function createSplitwiseTransaction({
    transactionId,
    friendId,
    amount,
    splitwiseTransactionId,
}: {
    transactionId: number;
    friendId: string;
    amount: number;
    splitwiseTransactionId: string;
}): Promise<void> {
    const sql = `
        INSERT INTO SplitwiseTransactions (
            SPLITWISE_TRANSACTION_ID,
            TRANSACTION_ID,
            FRIEND_ID,
            SPLITED_AMOUNT
        ) VALUES (?, ?, ?, ?)
    `;
    
    await query(sql, [
        splitwiseTransactionId,
        transactionId,
        parseInt(friendId),
        amount
    ]);
    
    console.log(`✅ Created Splitwise transaction for friend ${friendId}, amount: ${amount}`);
}

/**
 * Create Credit Card Cap Transaction and update cap current amount
 */
async function createCreditCardCapTransaction({
    transactionId,
    creditCardId,
    capId,
    amount,
}: {
    transactionId: number;
    creditCardId: string;
    capId: string;
    amount: number;
}): Promise<void> {
    try {
        // Insert cap transaction
        const insertSql = `
            INSERT INTO CreditCardCapTransactions (
                TRANSACTION_ID,
                CREDIT_CARD_ID,
                CAP_ID,
                AMOUNT
            ) VALUES (?, ?, ?, ?)
        `;
        
        await query(insertSql, [
            transactionId,
            parseInt(creditCardId),
            parseInt(capId),
            amount
        ]);        
        console.log(`✅ Created credit card cap transaction for cap ${capId}, amount: ${amount}`);
    } catch (error) {
        console.error('❌ Error creating credit card cap transaction:', error);
        throw error;
    }
}

const addExpenseSchema = z.object({
  amount: z.number(),
  date: z.string(), // ISO date string
  description: z.string(),
  account: z.object({
      id: z.string(),
      type: z.enum(['Bank', 'Credit Card']),
  }),
  categoryId: z.string(),
  subCategoryId: z.string().optional(),
  capId: z.string().optional(), // Credit card cap ID
  includeSplitwise: z.boolean().optional(),
  splitwiseGroupId: z.string().optional(),
  splitwiseUserIds: z.array(z.string()).optional(),
  splitwiseGroupName: z.string().optional(),
  splitType: z.enum(['equal', 'custom']).optional(),
  customAmounts: z.record(z.string(), z.number()).optional(),
});


export async function POST(request: NextRequest) 
{
    // Always refresh the mapping to ensure it's up to date
    await createSplitwiseToDbMapping();

    try {
        const body = await request.json();
        const parsedData = addExpenseSchema.parse(body);

        let { amount, date, description, account, categoryId, subCategoryId, capId, includeSplitwise, splitwiseGroupName, splitwiseUserIds, splitwiseGroupId, splitType, customAmounts } = parsedData;
        let splitAmt: number = 0;
        console.log("customAmounts received:", customAmounts);
        console.log("splitType:", splitType);
        
        // Only populate equal shares if splitType is 'equal' or customAmounts is not provided
        if (includeSplitwise && splitwiseUserIds && splitwiseUserIds.length > 0)
        {
            if (splitType === 'custom' && customAmounts && Object.keys(customAmounts).length > 0) 
            {
                // Use custom amounts provided by user
                splitAmt = Object.values(customAmounts).reduce((sum, amt) => sum + amt, 0);
                console.log('Using custom amounts, total:', splitAmt);
            } 
            else 
            {
                // Calculate equal share for each user (default or when splitType is 'equal')
                const perUserAmount = Math.ceil(amount / splitwiseUserIds.length);
                splitAmt = perUserAmount * splitwiseUserIds.length;
                console.log("perUserAmount:", perUserAmount);
                
                // Create customAmounts object with equal shares
                customAmounts = {};
                for (const userId of splitwiseUserIds) 
                {
                    customAmounts[userId] = perUserAmount;
                }
                console.log('Created equal shares customAmounts:', customAmounts);
            }
        }

        // Validate custom amounts if customAmounts exists
        if (includeSplitwise && customAmounts && splitwiseUserIds) 
        {
            const totalCustomAmount = Object.values(customAmounts).reduce((sum, amt) => sum + amt, 0);
            let tempAmt = Math.ceil(amount)
            //console.log("Total of custom amounts:", totalCustomAmount, "Expected amount:", amount, "Ceiled amount:", tempAmt);

            if (Math.abs(totalCustomAmount - tempAmt) > 0.01) 
            {
                return NextResponse.json({ 
                    error: `Custom amounts must total the expense amount. Total: ${totalCustomAmount}, Expected: ${amount}` 
                }, { status: 400 });
            }
        }

        // Use database transaction to ensure atomicity
        const result = await dbTransaction(async (connection) => {
            let transactionId: number;
            let splitwiseTransactionId: string | undefined;
            
            if (includeSplitwise && splitwiseGroupId && splitwiseUserIds && splitwiseUserIds.length > 0) 
            {
                // Add to Splitwise first and capture the response
                const splitwiseResponse = await addSplitwiseExpense({
                    amount: splitAmt,
                    description: parsedData.description,
                    groupId: splitwiseGroupId,
                    userIds: splitwiseUserIds,
                    splitType: 'custom',
                    customAmounts: customAmounts
                });
                // Extract Splitwise transaction ID from the response
                splitwiseTransactionId = splitwiseResponse?.expenses?.[0]?.id?.toString() || splitwiseResponse?.id?.toString();
                console.log('✅ Splitwise transaction created with ID:', splitwiseTransactionId);

                // Create main expense transaction in database
                transactionId = await createExpenseTransaction({
                    amount: Number(amount), 
                    date, 
                    description, 
                    account, 
                    categoryId, 
                    subCategoryId
                });
                
                // Create Splitwise transaction records for each friend
                const promises = splitwiseUserIds.map(async (userId) => {
                    if (userId.includes(CURRENT_USER_ID)) {
                        return;
                    }
                    
                    const dbFriendId = userMapping.get(userId);
                    if (!dbFriendId) {
                        console.warn(`⚠️ Friend ID not found for Splitwise user ${userId}`);
                        return;
                    }
                    
                    const splitAmount = customAmounts?.[userId];
                    if (!splitAmount) {
                        throw new Error(`Custom amount not found for user ${userId}`);
                    }
                    
                    await createSplitwiseTransaction({
                        transactionId,
                        friendId: dbFriendId,
                        amount: splitAmount,
                        splitwiseTransactionId: splitwiseTransactionId!,
                    });
                });
                
                await Promise.all(promises);
                console.log('✅ Created Splitwise expense with all friend transactions');
            } else {
                // No Splitwise, just create regular expense
                transactionId = await createExpenseTransaction({
                    amount, 
                    date, 
                    description, 
                    account, 
                    categoryId, 
                    subCategoryId
                });
                console.log('✅ Created regular expense transaction');
            }
            
            // Create credit card cap transaction if capId is provided and account is credit card
            if (capId && account.type === 'Credit Card') {
                await createCreditCardCapTransaction({
                    transactionId,
                    creditCardId: account.id,
                    capId,
                    amount
                });
            }
            
            return { transactionId, splitwiseTransactionId };
        });

        return NextResponse.json({ 
            success: true, 
            message: 'Expense added successfully.',
            transactionId: result.transactionId,
            splitwiseTransactionId: result.splitwiseTransactionId
        });

    } 
    catch (error) 
    {
        if (error instanceof Error) 
        {
            return NextResponse.json({ error: error.message }, { status: 500 });
        } 
        else 
        {
            return NextResponse.json({ error: String(error) }, { status: 500 });
        }
    }   
}
const updateExpenseSchema = z.object({
  id: z.string(),
  amount: z.number(),
  date: z.string(),
  description: z.string().optional(),
  account: z.object({
      id: z.string(),
      type: z.enum(['Bank', 'Credit Card']),
  }),
  categoryId: z.string(),
  subCategoryId: z.string().optional(),
  capId: z.string().optional(), // Credit card cap ID for updates
});

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const parsedData = updateExpenseSchema.parse(body);
        const { id, amount, date, description, account, categoryId, subCategoryId, capId } = parsedData;

        const epochTime = new Date(date).getTime();

        const sql = `
            UPDATE Transactions 
            SET DATE = ?,
                NOTES = ?,
                AMOUNT = ?,
                FROM_ACCOUNT_ID = ?,
                CATEGORY_ID = ?,
                SUB_CATEGORY_ID = ?
            WHERE ID = ? AND TRANSCATION_TYPE = ?
        `;

        await query(sql, [
            epochTime,
            description || '',
            amount,
            parseInt(account.id),
            parseInt(categoryId),
            subCategoryId ? parseInt(subCategoryId) : null,
            parseInt(id),
            TransactionType.EXPENSE
        ]);
        
        // Handle credit card cap transaction for updates
        if (account.type === 'Credit Card') {
            // First, get the old cap transaction details before deleting
            const oldCapSql = `
                SELECT CAP_ID, AMOUNT 
                FROM CreditCardCapTransactions 
                WHERE TRANSACTION_ID = ?
            `;
            const oldCapTransactions = await query<any>(oldCapSql, [parseInt(id)]);
            
            // Revert the old cap amount
            if (oldCapTransactions && oldCapTransactions.length > 0) {
                
                // Delete the old cap transaction
                const deleteSql = `
                    DELETE FROM CreditCardCapTransactions 
                    WHERE TRANSACTION_ID = ?
                `;
                await query(deleteSql, [parseInt(id)]);
            }
            
            // Now create new cap transaction if capId is provided
            if (capId) {
                await createCreditCardCapTransaction({
                    transactionId: parseInt(id),
                    creditCardId: account.id,
                    capId,
                    amount
                });
            }
        }
        
        return NextResponse.json({ 
            success: true, 
            message: 'Expense updated successfully.'
        });
    } catch (error) {
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        } else {
            return NextResponse.json({ error: String(error) }, { status: 500 });
        }
    }
}