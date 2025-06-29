
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const NOTION_BANK_ACCOUNTS_DB_ID = process.env.NOTION_BANK_ACCOUNTS_DB_ID;

async function fetchBankAccountsFromNotion()
{
  if (!NOTION_BANK_ACCOUNTS_DB_ID) {
    throw new Error("NOTION_BANK_ACCOUNTS_DB_ID is not set in environment variables.");
  }
  try {
    const response = await notion.databases.query({
      database_id: NOTION_BANK_ACCOUNTS_DB_ID,
    });
    return response.results.map((page) => {
      // Adjust these property names if your Notion database uses different names
      const accountNameProperty = (page as any).properties?.['Account']["title"][0]["plain_text"] // Assumes 'Account Name' is a Title property
      const balanceProperty = (page as any).properties?.['Current Balance']["formula"] // Assumes 'Balance' is a Number property
      const type = (page as any)['icon']['type']
      const logo = (page as any)['icon'][type]["url"];
      return {
        id: (page as any).id,
        name: accountNameProperty || "Unnamed Account",
        balance: balanceProperty?.number || 0,
        logo : logo || "",
      };
    });
  } catch (error) {
    console.error("Error fetching bank accounts from Notion:", error);
    throw new Error("Failed to fetch bank accounts from Notion.");
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.NOTION_API_KEY) {
      return NextResponse.json({ error: "Notion API key is not configured." }, { status: 500 });
    }
    const bankAccounts = await Promise.resolve(fetchBankAccountsFromNotion());
    return NextResponse.json({
      bankAccounts,
    });
  } catch (error) {
    console.error("Error in /api/bank-details:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while bank financial details.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
