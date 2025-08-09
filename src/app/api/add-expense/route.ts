
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';
import { error } from 'node:console';

const notion = new Client({ auth: process.env.NOTION_API_WRITE });
const EXPENSES_DB_ID = process.env.EXPENSE_DB_ID;
const CURRENT_USER_ID = process.env.SPLITWISE_CURRENT_USER_ID || "57391213"; // Your Splitwise user ID

const userMapping = new Map<string, string>();

// Splitwise API function using pure HTTP requests
async function addSplitwiseExpense({ amount, description, groupId, userIds }: {
    amount: number;
    description: string;
    groupId: string;
    userIds: string[];
}) {
    const SPLITWISE_API_KEY = process.env.SPLITWISE_API_KEY;
    
    if (!SPLITWISE_API_KEY) 
    {
        throw new Error('Splitwise API key not configured');
    }

    // Calculate equal split amount
    const totalUsers = userIds.length
    const splitAmount1 = (amount / totalUsers);
    const splitAmount = splitAmount1.toFixed(2); // Ensure it's a string with 2 decimal places

    // Create form data for Splitwise API
    const formData = new URLSearchParams();
    formData.append('cost', amount.toString());
    formData.append('description', description);
    formData.append('group_id', groupId);
    formData.append('split_equally', 'true');
    formData.append('currency_code', 'INR'); // Adjust currency as needed
    formData.append('details', "string");
    
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

    const response = await fetch('https://secure.splitwise.com/api/v3.0/create_expense', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SPLITWISE_API_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`Splitwise API failed: ${response.status} - ${responseText}`);
    }

    const result = JSON.parse(responseText);
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
       
        
        const response = await notion.databases.query({
            database_id: SPLITWISE_USERS_DB_ID,
        });

        response.results.forEach((page: any) => 
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

        let { amount, date, description, account, categoryId, subCategoryId, includeSplitwise, splitwiseGroupName, splitwiseUserIds, splitwiseGroupId } = parsedData;


        // Fetch Splitwise user mapping for enhanced descriptions
        // Use the global userMapping Map for lookup 
         

        console.log('✅ Notion expense created successfully');
        let result;
        if (includeSplitwise && splitwiseGroupId && splitwiseUserIds && splitwiseUserIds.length > 0) {
            try {
                
                    const notionProp = await createNotionExpense({amount: Number(amount), date, description, account, categoryId, subCategoryId});

                    result = await notion.pages.create({
                        parent: { database_id: EXPENSES_DB_ID },
                        properties: notionProp,
                    });
                    resultForOthersId = result.id;
                
               
                // await addSplitwiseExpense({
                //     amount,
                //     description: parsedData.description, // Use original description for Splitwise
                //     groupId: splitwiseGroupId,
                //     userIds: splitwiseUserIds
                // });
                const totalUsers = splitwiseUserIds.length
                const splitAmount = (amount / totalUsers).toFixed(2);
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
                        
                        const notionSplitProp = await fetchNotionSplitwiseProp({
                            amount: Number(splitAmount), 
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

            } catch (splitwiseError) {
                console.error('❌ Failed to add expense to Splitwise:', splitwiseError);
                // Don't fail the entire request if Splitwise fails
            }
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

    } catch (error) {
        console.error('Error adding expense to Notion:', error);
        if (error instanceof z.ZodError) {
             return NextResponse.json({ error: 'Invalid data provided.', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }   
}