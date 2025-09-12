
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';
import { fetchAllPagesFromNotion } from '@/lib/notion-helpers';

const notion = new Client({ auth: process.env.NOTION_API_WRITE });
const EXPENSES_DB_ID = process.env.EXPENSE_DB_ID;
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

async function fetchNotionSplitwiseProp({ amount, description, notionFriendId, expenseId }: {
    amount: number;
    description: string;
    notionFriendId: string;
    expenseId: string;
    })
    {
        const properties: any = {
            "expense description":  {"title": [{"text": {"content":description}}]},
            "Amount": {"number": amount},
            "Friend's Name": {"relation": [{"id":notionFriendId}]},
            "Expense Link": {"relation": [{"id": expenseId}]}
        };
        return properties;
    }

// Function to fetch Notion pages and create Splitwise user ID to Notion ID mapping
async function createSplitwiseToNotionMapping(): Promise<Map<string, string>> 
{
    const SPLITWISE_USERS_DB_ID = process.env.SPLITWISE_USERS_DB_ID;
    
    if (!SPLITWISE_USERS_DB_ID) 
    {
       
        return new Map();
    }

    try {
       
        
        const results = await fetchAllPagesFromNotion(notion, SPLITWISE_USERS_DB_ID);
        results.forEach((page: any) => 
        {
            const notionId = page["id"]
            const nameProperty = page["properties"]["Name"]["title"][0]["plain_text"]
            const splitwiseUserId = page["properties"]["Splitwise id"]["number"]
            
            
            if (notionId && nameProperty && splitwiseUserId !== null && splitwiseUserId !== undefined) {
                // Convert splitwiseUserId to string to match the type from splitwiseUserIds array
                const splitwiseUserIdStr = String(splitwiseUserId);
                userMapping.set(splitwiseUserIdStr, notionId);
            }
        });
        return userMapping;


    } catch (error) {
        console.error('❌ Error fetching Splitwise user mappings:', error);
        return new Map(); // Return empty map on error
    }
}


// Notion expense creation function
async function createNotionExpense({ amount, date, description, account, categoryId, subCategoryId }: {
    amount: number;
    date: string;
    description: string;
    account: { id: string; type: 'Bank' | 'Credit Card' };
    categoryId: string;
    subCategoryId?: string;
}) {
    const properties: any = {
        "Expense": {"title": [{"text": {"content": description}}]},
        "Amount": {"number": amount},
        "Date": {"date": {"start": date}},
        "Category": {"relation": [{"id": categoryId}]}
    };
    
    if (account.type === 'Bank') {
        properties['Account Type'] = {"select": {"name": "Bank Account"}};
        properties['Bank Account'] = { relation: [{ id: account.id }] };
    }
    else if (account.type === 'Credit Card') {
        properties['Account Type'] = {"select": {"name": "Credit Card Account"}};
        properties['Credit Card Account'] = { relation: [{ id: account.id }] };
    }

    if (subCategoryId) {
        properties['Sub Category'] = { relation: [{ id: subCategoryId }] };
    }


    if (!EXPENSES_DB_ID) {
        throw new Error('Expense database ID is not configured');
    }
    return properties;
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
    await createSplitwiseToNotionMapping();
    
    let resultForOthersId: string | undefined;
    if (!EXPENSES_DB_ID) 
    {
        return NextResponse.json({ error: 'Expense database ID is not configured.' }, { status: 500 });
    }
    if (!process.env.NOTION_API_KEY) 
    {
        return NextResponse.json({ error: 'Notion API key is not configured.' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const parsedData = addExpenseSchema.parse(body);

        let { amount, date, description, account, categoryId, subCategoryId, includeSplitwise, splitwiseGroupName, splitwiseUserIds, splitwiseGroupId, splitType, customAmounts } = parsedData;
        let splitAmt: number = 0;
        // If splitType is equal or undefined, populate customAmounts with equal shares
        if (includeSplitwise && splitwiseUserIds && splitwiseUserIds.length > 0 && 
            (!splitType || splitType === 'equal')) 
        {
            // Calculate equal share for each user
            const perUserAmount = Math.ceil(amount / splitwiseUserIds.length);
            splitAmt = perUserAmount * splitwiseUserIds.length;
            console.log("perUserAmount :",perUserAmount)
            // Create customAmounts object if it doesn't exist
            customAmounts = customAmounts || {};
            
            // Populate with equal shares for all users
            for (const userId of splitwiseUserIds) 
            {
                customAmounts[userId] = perUserAmount;
            }
            
            console.log('Created equal shares customAmounts:', customAmounts);
        }

        // Validate custom amounts if customAmounts exists (either from input or just created)
        if (includeSplitwise && customAmounts && splitwiseUserIds) {
            const totalCustomAmount = Object.values(customAmounts).reduce((sum, amt) => sum + amt, 0);
            if (Math.abs(totalCustomAmount - splitAmt) > 0.01) {
                return NextResponse.json({ error: 'Custom amounts must total the expense amount.' }, { status: 400 });
            }
        }


        // Fetch Splitwise user mapping for enhanced descriptions
        // Use the global userMapping Map for lookup 
         

        console.log('✅ Notion expense created successfully');
        let result;
        if (includeSplitwise && splitwiseGroupId && splitwiseUserIds && splitwiseUserIds.length > 0) {

                await addSplitwiseExpense({
                    amount: splitAmt,
                    description: parsedData.description, // Use original description for Splitwise
                    groupId: splitwiseGroupId,
                    userIds: splitwiseUserIds,
                    splitType: 'custom',
                    customAmounts: customAmounts
                });

                const notionProp = await createNotionExpense({amount: Number(amount), date, description, account, categoryId, subCategoryId});

                result = await notion.pages.create({
                    parent: { database_id: EXPENSES_DB_ID },
                    properties: notionProp,
                });
                resultForOthersId = result.id;
                
                
                const splitwiseDbId = process.env.SPLITWISE_DB_ID;
                if (!splitwiseDbId) 
                {
                    throw new Error('Splitwise database ID is not configured');
                }
                
                await Promise.all(splitwiseUserIds.map(async (userId, index) => 
                {
                    if(userId.includes(CURRENT_USER_ID))
                    {
                        return;
                    }
                    if (resultForOthersId) 
                    {
                        const notionUserId = userMapping.get(userId);
                        if (!notionUserId) {
                            throw new Error("UserId not found");
                        }
                        
                        let splitAmount: number;
                        if (customAmounts) {
                            // Use the pre-calculated amount from customAmounts
                            splitAmount = customAmounts[userId];
                        } else {
                            throw new Error("Custom amounts not found");
                        }
                        
                        const notionSplitProp = await fetchNotionSplitwiseProp({

                            amount: splitAmount, 
                            description, 
                            notionFriendId: notionUserId, 
                            expenseId: resultForOthersId
                        });
                        
                        
                        result = await notion.pages.create({
                            parent: { database_id: splitwiseDbId },
                            properties: notionSplitProp,
                        });
                    }
                }));
        } else {
            // No Splitwise, just create regular Notion expense
            const notionProp = await createNotionExpense({amount, date, description, account, categoryId, subCategoryId});
            result = await notion.pages.create({
                parent: { database_id: EXPENSES_DB_ID },
                properties: notionProp,
            });
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Expense added successfully.',
            notionResult: result,
            userMapping: userMapping
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