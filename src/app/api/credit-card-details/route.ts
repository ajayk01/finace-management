
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const NOTION_CREDIT_CARDS_DB_ID = process.env.NOTION_CREDIT_CARDS_DB_ID;

async function fetchCreditCardsFromNotion() 
{
  if (!NOTION_CREDIT_CARDS_DB_ID) {
    throw new Error("NOTION_CREDIT_CARDS_DB_ID is not set in environment variables.");
  }
  try {
    const response = await notion.databases.query({
      database_id: NOTION_CREDIT_CARDS_DB_ID,
    });

    return response.results.map((page) => 
    {
      const cardNameProperty = (page as any).properties?.['Name']["title"][0]["plain_text"]; 
      const usedAmountProperty = (page as any).properties?.['Total Used']["formula"]; 
      const totalLimitProperty = (page as any).properties?.['Total Limit']["formula"];
      const isActive = (page as any).properties?.['Is Active']["number"]
      if(isActive == 0)
      {
          return null; //Skip inactive cards
      }
      
      const type = (page as any)['icon']['type']
      const logo = (page as any)['icon'][type]["url"];
      return {
        id: (page as any).id,
        name: cardNameProperty  || "Unnamed Card",
        usedAmount: usedAmountProperty?.number || 0,
        totalLimit: totalLimitProperty?.number || 0,
        logo: logo || "",
      };
    }).filter(card => card !== null).sort((a, b) => b.usedAmount - a.usedAmount);
  } catch (error) {
    console.error("Error fetching credit cards from Notion:", error);
    throw new Error("Failed to fetch credit cards from Notion.");
  }
}
export async function GET(request: NextRequest) {
  try {
    if (!process.env.NOTION_API_KEY) 
    {
      return NextResponse.json({ error: "Notion API key is not configured." }, { status: 500 });
    }
    const creditCardDetails = await Promise.resolve(fetchCreditCardsFromNotion());
    return NextResponse.json({
      creditCardDetails,
    });
  } catch (error) {
    console.error("Error in /api/credit-card-details:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching credit card details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
