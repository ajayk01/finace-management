
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, transaction as dbTransaction, TransactionType, AccountType } from '@/lib/db';
import type { SplitwiseFriend } from '@/types/database';

const CURRENT_USER_ID = process.env.SPLITWISE_CURRENT_USER_ID || "57391213"; // Your Splitwise user ID

const userMapping = new Map<string, string>();

// Splitwise API function using pure HTTP requests
async function addSplitwiseExpense({ amount, description, groupId, userIds, splitType, customAmounts, date }: {
    amount: number;
    description: string;
    groupId: string;
    userIds: string[];
    splitType?: 'equal' | 'custom';
    customAmounts?: Record<string, number>;
    date?: string;
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
    if (date) {
        formData.append('date', new Date(date).toISOString());
    }
    
    // Determine if we're using equal split or custom amounts
    const useEqualSplit = splitType === 'equal' || !splitType || !customAmounts;
    formData.append('split_equally', useEqualSplit ? 'true' : 'false');
    
    if (useEqualSplit) {
        // Equal split logic with proper rounding to avoid decimal mismatch
        const totalUsers = userIds.length;
        const totalCents = Math.round(amount * 100);
        const baseCents = Math.floor(totalCents / totalUsers);
        const remainderCents = totalCents - (baseCents * totalUsers);
        
        // Build per-user amounts: first 'remainderCents' users get 1 extra cent
        const perUserAmounts: string[] = userIds.map((_, index) => {
            const cents = baseCents + (index < remainderCents ? 1 : 0);
            return (cents / 100).toFixed(2);
        });
        
        // Current user (who paid the expense)
        formData.append('users__0__user_id', CURRENT_USER_ID);
        formData.append('users__0__paid_share', amount.toString());
        const currentUserIdx = userIds.indexOf(CURRENT_USER_ID);
        if (currentUserIdx !== -1) 
        {
            formData.append('users__0__owed_share', perUserAmounts[currentUserIdx]);
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
            formData.append(`users__${userIndex}__owed_share`, perUserAmounts[index]);
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
    description?: string;
    account: { id: string; type: 'Bank' | 'Credit Card' };
    categoryId?: string;
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
        description || '',
        amount,
        parseInt(account.id),
        categoryId ? parseInt(categoryId) : null,
        subCategoryId ? parseInt(subCategoryId) : null,
        TransactionType.EXPENSE
    ]);
    // Extract the inserted ID from the result
    const insertedId = result?.insertId || result?.[0]?.insertId || 0;
    
    console.log(`✅ Created expense transaction with ID: ${insertedId}, date: ${date} (epoch: ${epochTime})`);
    return insertedId;
}

/**
 * Create a dummy transaction in Transactions table for splitwise split tracking.
 * Amount is 0, account is null. Will be updated during settle-up.
 */
async function createDummyTransaction({
    date,
    description,
    categoryId,
    subCategoryId,
}: {
    date: string;
    description?: string;
    categoryId?: string;
    subCategoryId?: string;
}): Promise<number> {
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
        description || '',
        0, // Amount is 0 for dummy transaction
        null, // Account is null for dummy transaction
        categoryId ? parseInt(categoryId) : null,
        subCategoryId ? parseInt(subCategoryId) : null,
        TransactionType.EXPENSE
    ]);
    
    const insertedId = result?.insertId || result?.[0]?.insertId || 0;
    console.log(`✅ Created dummy transaction with ID: ${insertedId}`);
    return insertedId;
}

/**
 * Create Splitwise transaction record in database with a linked dummy transaction
 */
async function createSplitwiseTransaction({
    transactionId,
    friendId,
    amount,
    splitwiseTransactionId,
    splitedTransactionId,
}: {
    transactionId: number;
    friendId: string;
    amount: number;
    splitwiseTransactionId: string;
    splitedTransactionId: number;
}): Promise<void> {
    const sql = `
        INSERT INTO SplitwiseTransactions (
            SPLITWISE_TRANSACTION_ID,
            TRANSACTION_ID,
            FRIEND_ID,
            SPLITED_AMOUNT,
            SPLITED_TRANSACTION_ID
        ) VALUES (?, ?, ?, ?, ?)
    `;
    
    await query(sql, [
        splitwiseTransactionId,
        transactionId,
        parseInt(friendId),
        amount,
        splitedTransactionId
    ]);
    
    console.log(`✅ Created Splitwise transaction for friend ${friendId}, amount: ${amount}, dummy tx: ${splitedTransactionId}`);
}

/**
 * Create Credit Card Transaction entry with calculated rewards
 */
async function createCreditCardTransaction({
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
        // Fetch the cap percentage to calculate rewards
        const capSql = `SELECT CAP_PERCENTAGE, REWARD_PER_AMOUNT FROM CreditCardCapDetails WHERE ID = ?`;
        const capRows = await query<any>(capSql, [parseInt(capId)]);
        
        if (!capRows || capRows.length === 0) {
            console.warn(`⚠️ Cap not found for ID ${capId}, skipping CreditCardTransactions insert`);
            return;
        }
        
        const capPercentage = Number(capRows[0].CAP_PERCENTAGE) || 0;
        const rewardPerAmount = Number(capRows[0].REWARD_PER_AMOUNT) || 100;
        const rewards = (Math.trunc(amount) * capPercentage) / rewardPerAmount;
        
        const insertSql = `
            INSERT INTO CreditCardTransactions (
                TransactionId,
                CreditCardId,
                CapId,
                Rewards
            ) VALUES (?, ?, ?, ?)
        `;
        
        await query(insertSql, [
            transactionId,
            parseInt(creditCardId),
            parseInt(capId),
            rewards,
        ]);
        
        console.log(`✅ Created CreditCardTransactions entry for cap ${capId}, rewards: ${rewards}`);
    } catch (error) {
        console.error('❌ Error creating credit card transaction:', error);
        throw error;
    }
}

const addExpenseSchema = z.object({
  amount: z.number(),
  charges: z.number().optional().default(0),
  date: z.string(), // ISO date string
  description: z.string().optional(),
  account: z.object({
      id: z.string(),
      type: z.enum(['Bank', 'Credit Card']),
  }),
  categoryId: z.string().optional(),
  subCategoryId: z.string().optional(),
  capId: z.string().optional(), // Credit card cap ID
  includeSplitwise: z.boolean().optional(),
  splitwiseGroupId: z.string().optional(),
  splitwiseUserIds: z.array(z.string()).optional(),
  splitwiseGroupName: z.string().optional(),
  splitType: z.enum(['equal', 'custom']).optional(),
  customAmounts: z.record(z.string(), z.number()).optional(),
});


/**
 * Look up the "Charges" category and "Platform Fee" subcategory IDs from the database
 */
async function getChargesCategoryIds(): Promise<{ categoryId: string; subCategoryId: string | null }> {
    const catSql = `SELECT ID FROM Category WHERE CATEGORY_NAME = 'Charges' LIMIT 1`;
    const catRows = await query<any>(catSql);
    if (!catRows || catRows.length === 0) {
        throw new Error('Charges category not found in database');
    }
    const categoryId = catRows[0].ID.toString();

    const subCatSql = `SELECT ID FROM SubCategory WHERE CATEGORY_ID = ? AND SUB_CATEGORY_NAME = 'Platform Fee' LIMIT 1`;
    const subCatRows = await query<any>(subCatSql, [parseInt(categoryId)]);
    const subCategoryId = subCatRows && subCatRows.length > 0 ? subCatRows[0].ID.toString() : null;

    return { categoryId, subCategoryId };
}

export async function POST(request: NextRequest) 
{
    // Always refresh the mapping to ensure it's up to date
    await createSplitwiseToDbMapping();

    try {
        const body = await request.json();
        const parsedData = addExpenseSchema.parse(body);

        let { amount, charges, date, description, account, categoryId, subCategoryId, capId, includeSplitwise, splitwiseGroupName, splitwiseUserIds, splitwiseGroupId, splitType, customAmounts } = parsedData;
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
                // Calculate equal share for each user with proper rounding
                // Floor to 2 decimal places, then distribute remainder cents to first user(s)
                const totalCents = Math.round(amount * 100);
                const baseCents = Math.floor(totalCents / splitwiseUserIds.length);
                const remainderCents = totalCents - (baseCents * splitwiseUserIds.length);
                
                customAmounts = {};
                splitwiseUserIds.forEach((userId, index) => {
                    // First 'remainderCents' users get 1 extra cent
                    const userCents = baseCents + (index < remainderCents ? 1 : 0);
                    customAmounts![userId] = userCents / 100;
                });
                
                splitAmt = Object.values(customAmounts).reduce((sum, amt) => sum + amt, 0);
                console.log('Created equal shares with rounding adjustment, customAmounts:', customAmounts, 'total:', splitAmt);
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
                    description: parsedData.description? parsedData.description : "No description",
                    groupId: splitwiseGroupId,
                    userIds: splitwiseUserIds,
                    splitType: 'custom',
                    customAmounts: customAmounts,
                    date: date
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
                
                // Create ONE dummy transaction per splitwise expense (shared across all friend splits)
                const dummyTxId = await createDummyTransaction({
                    date,
                    description,
                    categoryId,
                    subCategoryId,
                });
                console.log(`✅ Created one dummy transaction ${dummyTxId} for splitwise expense ${splitwiseTransactionId}`);
                
                // Create Splitwise transaction records for each friend, all pointing to the same dummy
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
                        splitedTransactionId: dummyTxId,
                    });
                });
                
                await Promise.all(promises);
                console.log('✅ Created Splitwise expense with all friend splits linked to dummy transaction');
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
                await createCreditCardTransaction({
                    transactionId,
                    creditCardId: account.id,
                    capId,
                    amount
                });
            }
            
            // Create a separate charges transaction if charges > 0
            if (charges && charges > 0) {
                const chargesIds = await getChargesCategoryIds();
                const chargesTransactionId = await createExpenseTransaction({
                    amount: charges,
                    date,
                    description: `Charges for ${transactionId}`,
                    account,
                    categoryId: chargesIds.categoryId,
                    subCategoryId: chargesIds.subCategoryId || undefined,
                });
                console.log(`✅ Created charges transaction with ID: ${chargesTransactionId}, amount: ${charges}`);
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
  charges: z.number().optional().default(0),
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
        const { id, amount, charges, date, description, account, categoryId, subCategoryId, capId } = parsedData;

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
            // Delete old CreditCardTransactions entry
            const deleteRewardsSql = `
                DELETE FROM CreditCardTransactions 
                WHERE TransactionId = ?
            `;
            await query(deleteRewardsSql, [parseInt(id)]);
            
            // Now create new cap transaction if capId is provided
            if (capId) {
                await createCreditCardTransaction({
                    transactionId: parseInt(id),
                    creditCardId: account.id,
                    capId,
                    amount
                });
            }
        }
        
        // Create a separate charges transaction if charges > 0
        if (charges && charges > 0) {
            const chargesIds = await getChargesCategoryIds();
            const chargesTxId = await createExpenseTransaction({
                amount: charges,
                date,
                description: `Charges for ${id}`,
                account,
                categoryId: chargesIds.categoryId,
                subCategoryId: chargesIds.subCategoryId || undefined,
            });
            console.log(`✅ Created charges transaction with ID: ${chargesTxId} for updated expense ${id}`);
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