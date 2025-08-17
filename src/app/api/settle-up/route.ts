'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_WRITE });
const EXPENSES_DB_ID = process.env.EXPENSE_DB_ID;

export async function POST(request: NextRequest) {
  try {
    const { friendName, bankAccountId, transactions } = await request.json();

    if (!friendName || !bankAccountId || !Array.isArray(transactions)) {
      return NextResponse.json({ 
        error: 'Friend name, bank account ID, and transactions array are required' 
      }, { status: 400 });
    }

    if (!EXPENSES_DB_ID) {
      return NextResponse.json({ error: 'Expense database ID is not configured' }, { status: 500 });
    }

    const offsetEntries = [];

    // Fetch each transaction and create offsetting entry
    for (const transaction of transactions) {
      const { id: transactionId, amount: transactionAmount, splitwiseId:splitwiseId } = transaction;
      
      try {
        const transactionPage = await notion.pages.retrieve({ page_id: transactionId });
        const properties = (transactionPage as any).properties;
        
        // Use the amount from the API call (which might be processed/filtered) rather than original
        const settlementAmount = transactionAmount || properties.Amount?.number || 0;
        const originalDate = properties.Date?.date?.start || new Date().toISOString().split('T')[0];
        const category = properties["Category"]["relation"][0]["id"]
        const subCategory = properties['Sub Category']["relation"][0]["id"]
        const description = properties.Expense?.title?.[0]?.plain_text || '';

        const propertiesObj: { [key: string]: any } = {
          "Date": { date: { start: originalDate } },
          "Expense": { title: [{ text: { content: `Settlement from: ${friendName} Des: ${description}` } }] },
          "Amount": { number: -settlementAmount },
          "Category": { relation: [{ id: category }] },
          "Bank Account": { relation: [{ id: bankAccountId }] },
        };

        if(subCategory)
        {
            propertiesObj["Sub Category"] = { relation: [{ id: subCategory }] };
        }

        const offsetEntry = await notion.pages.create({
          parent: { database_id: EXPENSES_DB_ID },
          properties: propertiesObj,
        });

          try {
            await notion.pages.update({
              page_id: splitwiseId,
              archived: true
            });
          } catch (deleteError) {
            console.error(`Error archiving splitwise page ${splitwiseId}:`, deleteError);
            // Continue even if deletion fails
          }
        

        offsetEntries.push({
          id: offsetEntry.id,
          originalTransactionId: transactionId,
          amount: -settlementAmount,
          description: `Settlement from: ${friendName}`,
        });

      } catch (error) {
        console.error(`Error creating offset for transaction ${transactionId}:`, error);
        // Continue with other transactions even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${offsetEntries.length} settlement entries for ${friendName}`,
      offsetEntries,
    });

  } catch (error) {
    console.error('Error creating settlement entries:', error);
    return NextResponse.json({ 
      error: 'Failed to create settlement entries' 
    }, { status: 500 });
  }
}
