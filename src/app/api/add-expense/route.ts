
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { z } from 'zod';

const notion = new Client({ auth: process.env.NOTION_API_WRITE });
const EXPENSES_DB_ID = process.env.EXPENSE_DB_ID;

// Splitwise API function using pure HTTP requests
async function addSplitwiseExpense({ amount, description, groupId, userIds }: {
    amount: number;
    description: string;
    groupId: string;
    userIds: string[];
}) {
    const SPLITWISE_API_KEY = process.env.SPLITWISE_API_KEY;
    const CURRENT_USER_ID = process.env.SPLITWISE_CURRENT_USER_ID || "57391213"; // Your Splitwise user ID
    
    if (!SPLITWISE_API_KEY) {
        throw new Error('Splitwise API key not configured');
    }

    // Calculate equal split amount
    const totalUsers = userIds.length
    const splitAmount1 = (amount / totalUsers);
    console.log("the split amount is: ", splitAmount1);
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
    

    // Other users (who owe money)
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

    console.log('📤 Sending to Splitwise API:', formData.toString());

    // Make HTTP request to Splitwise API
    const response = await fetch('https://secure.splitwise.com/api/v3.0/create_expense', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SPLITWISE_API_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
    });

    const responseText = await response.text();
    console.log(`📥 Splitwise API Response (${response.status}):`, responseText);

    if (!response.ok) {
        throw new Error(`Splitwise API failed: ${response.status} - ${responseText}`);
    }

    const result = JSON.parse(responseText);
    return result;
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


export async function POST(request: NextRequest) {
    if (!EXPENSES_DB_ID) {
        return NextResponse.json({ error: 'Expense database ID is not configured.' }, { status: 500 });
    }
    if (!process.env.NOTION_API_KEY) {
        return NextResponse.json({ error: 'Notion API key is not configured.' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const parsedData = addExpenseSchema.parse(body);

        let { amount, date, description, account, categoryId, subCategoryId, includeSplitwise, splitwiseGroupName, splitwiseUserIds, splitwiseGroupId } = parsedData;
        const properties: any = {
            "Expense":  {"title": [{"text": {"content":description}}]},
            "Amount": {"number":amount},
            "Date": {"date": {"start":date}},
            "Category": {"relation": [{"id":categoryId}]}
        };
        
        if (account.type === 'Bank') 
        {
            properties['Account Type'] = {"select": {"name":"Bank Account"}};
            properties['Bank Account'] = { relation: [{ id: account.id }] };
        }
        else if (account.type === 'Credit Card') 
        {
            properties['Account Type'] = {"select": {"name":"Credit Card Account"}};
            properties['Credit Card Account'] = { relation: [{ id: account.id }] };
        }

        if (subCategoryId) 
        {
            properties['Sub Category'] = { relation: [{ id: subCategoryId }] };
        }

        console.log('Adding expense to Notion with properties:', properties);
        console.log('Include Splitwise:', includeSplitwise);

        // await notion.pages.create({
        //     parent: { database_id: EXPENSES_DB_ID },
        //     properties: properties,
        // });

        // Add expense to Splitwise if enabled
        if (includeSplitwise && splitwiseGroupId && splitwiseUserIds && splitwiseUserIds.length > 0) {
            try {
                await addSplitwiseExpense({
                    amount,
                    description,
                    groupId: splitwiseGroupId,
                    userIds: splitwiseUserIds
                });
                console.log('✅ Successfully added expense to Splitwise');
            } catch (splitwiseError) {
                console.error('❌ Failed to add expense to Splitwise:', splitwiseError);
                // Don't fail the entire request if Splitwise fails
            }
        }

        if (includeSplitwise) 
        {
            console.log('Splitwise Group:', splitwiseGroupName);
            console.log('Splitwise User IDs:', splitwiseUserIds);
            if (splitwiseUserIds && splitwiseUserIds.includes('57391213')) 
            {
                console.log('✅ Found user ID 57391213 in splitwiseUserIds');
            } 
            else 
            {
                console.log('❌ User ID 57391213 NOT found in splitwiseUserIds');
            }
        }

        return NextResponse.json({ success: true, message: 'Expense added to Notion.' });

    } catch (error) {
        console.error('Error adding expense to Notion:', error);
        if (error instanceof z.ZodError) 
        {
             return NextResponse.json({ error: 'Invalid data provided.', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
    }
}