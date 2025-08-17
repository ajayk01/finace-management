'use server';

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const  SPLITWISE_DB_ID= process.env.SPLITWISE_DB_ID;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const friendName = searchParams.get('friendName');
    const friendPageId = searchParams.get('friendPageId');

    if (!friendName && !friendPageId) {
      return NextResponse.json({ error: 'Friend name or page ID is required' }, { status: 400 });
    }

    if (!SPLITWISE_DB_ID) {
      return NextResponse.json({ error: 'Splitwise database ID is not configured' }, { status: 500 });
    }

    // Query Notion database for transactions involving this friend
    // This assumes you have a field in your expenses that tracks the friend/person involved
    let filter: any;
    if (friendPageId) {
      // If we have the friend's page ID, query by relation to the friend
      filter = {
        property: "Friend's Name", // Assuming you have a relation property to friends
        relation: {
          contains: friendPageId,
        },
      };
    }

    const response = await notion.databases.query({
      database_id: SPLITWISE_DB_ID,
      filter,
    });

    const transactions = response.results.map((page: any) => {
      const properties = page.properties;
      return {
        id: properties["Expense Link"]["relation"][0]["id"],
        splitwiseId: page.id,
        date: properties.Date?.date?.start || null,
        description: properties.Description?.title?.[0]?.plain_text || '',
        amount: properties.Amount?.number || 0,
        category: properties.Category?.select?.name || '',
        subCategory: properties['Sub Category']?.select?.name || '',
        accountId: properties.Account?.relation?.[0]?.id || null,
        friendPageId: properties["Friend's Name"]?.relation?.[0]?.id || null,
      };
    }).filter(transaction => {
      // If we have friendPageId, filter by that relation
      if (friendPageId) {
        return transaction.friendPageId === friendPageId && transaction.amount > 0;
      }
      return false;
    });

    return NextResponse.json({ 
      transactions,
      friendName: friendName || null,
      friendPageId: friendPageId || null,
      count: transactions.length 
    });

  } catch (error) {
    console.error('Error fetching friend transactions:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch friend transactions' 
    }, { status: 500 });
  }
}
