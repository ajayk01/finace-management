
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const NOTION_YEARLY_SUMMARY_DB_ID = process.env.NOTION_YEARLY_SUMMARY_DB_ID;

const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Fetches pre-aggregated yearly summary data from a specific Notion database.
 */
async function fetchYearlySummaryFromNotion(year: number) {
    if (!NOTION_YEARLY_SUMMARY_DB_ID) {
        throw new Error("NOTION_YEARLY_SUMMARY_DB_ID is not set in environment variables.");
    }

    // Initialize summary data with 0s for all months
    const summaryData = months.map(monthName => ({
        month: monthName,
        expense: 0,
        income: 0,
        investment: 0,
    }));

    try {
        const response = await notion.databases.query({
            database_id: NOTION_YEARLY_SUMMARY_DB_ID,
            filter: {
                // Assuming 'Month - Year' is a Title property, e.g. "2024-05"
                property: 'Month - Year',
                title: {
                    starts_with: `${year}-`,
                },
            },
            sorts: [
                {
                    property: 'Month - Year',
                    direction: 'ascending',
                },
            ],
        });

        // Map response to our summaryData structure
        response.results.forEach((page: any) => {
            const properties = page.properties;
            const monthYearStr = properties['Month - Year']?.title?.[0]?.plain_text; // e.g., "2025-06"
            if (!monthYearStr || !monthYearStr.includes('-')) return;

            const monthIndex = parseInt(monthYearStr.split('-')[1], 10) - 1;

            if (monthIndex >= 0 && monthIndex < 12) {
                // Handle both Number and Formula properties for flexibility
                const expense = properties['Expense']?.number ?? properties['Expense']?.formula?.number ?? 0;
                const income = properties['Income']?.number ?? properties['Income']?.formula?.number ?? 0;
                const investment = properties['Investments']?.number ?? properties['Investments']?.formula?.number ?? 0;
                
                summaryData[monthIndex].expense = expense;
                summaryData[monthIndex].income = income;
                summaryData[monthIndex].investment = investment;
            }
        });
        
        return summaryData;

    } catch (error) {
        console.error(`Error fetching yearly summary for ${year} from Notion:`, error);
        // On error, return the initialized array of zeros to avoid breaking the frontend chart.
        return summaryData;
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const yearParam = searchParams.get('year');
        
        if (!process.env.NOTION_API_KEY) {
          return NextResponse.json({ error: "Notion API key is not configured." }, { status: 500 });
        }
        if (!yearParam) {
            return NextResponse.json({ error: "Year is a required query parameter." }, { status: 400 });
        }
        const year = parseInt(yearParam, 10);
        
        if (!process.env.NOTION_YEARLY_SUMMARY_DB_ID) {
             return NextResponse.json({ error: "NOTION_YEARLY_SUMMARY_DB_ID is not configured in environment variables. Please add it to your .env file." }, { status: 500 });
        }

        const summaryData = await fetchYearlySummaryFromNotion(year);

        return NextResponse.json({
            summaryData,
        });

    } catch (error) {
        console.error("Error in /api/yearly-summary:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
