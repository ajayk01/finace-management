
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, TransactionType } from '@/lib/db';

const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

interface MonthlySummary {
    month: string;
    expense: number;
    income: number;
    investment: number;
}

/**
 * Fetches yearly summary data from MySQL by aggregating transactions.
 */
async function fetchYearlySummaryFromDB(year: number): Promise<MonthlySummary[]> {
    // Initialize summary data with 0s for all months
    const summaryData: MonthlySummary[] = months.map(monthName => ({
        month: monthName,
        expense: 0,
        income: 0,
        investment: 0,
    }));

    try {
        // Calculate start and end timestamps for the year
        const startDate = new Date(year, 0, 1).getTime(); // Jan 1
        const endDate = new Date(year, 11, 31, 23, 59, 59, 999).getTime(); // Dec 31

        const sql = `
            SELECT 
                MONTH(FROM_UNIXTIME(DATE / 1000)) as MONTH_NUM,
                TRANSCATION_TYPE,
                SUM(AMOUNT) as TOTAL_AMOUNT
            FROM Transactions
            WHERE DATE >= ? AND DATE <= ?
                AND TRANSCATION_TYPE IN (?, ?, ?)
            GROUP BY MONTH_NUM, TRANSCATION_TYPE
            ORDER BY MONTH_NUM
        `;

        const results = await query<{
            MONTH_NUM: number;
            TRANSCATION_TYPE: number;
            TOTAL_AMOUNT: number;
        }>(sql, [
            startDate,
            endDate,
            TransactionType.EXPENSE,
            TransactionType.INCOME,
            TransactionType.INVESTMENT
        ]);

        console.log(`Fetched ${results.length} monthly aggregations for year ${year}`);

        // Map results to summaryData
        results.forEach((row: any) => {
            const monthIndex = row.MONTH_NUM - 1; // Convert 1-12 to 0-11
            if (monthIndex >= 0 && monthIndex < 12) {
                const amount = Number(row.TOTAL_AMOUNT) || 0;
                
                switch (row.TRANSCATION_TYPE) {
                    case TransactionType.EXPENSE:
                        summaryData[monthIndex].expense = amount;
                        break;
                    case TransactionType.INCOME:
                        summaryData[monthIndex].income = amount;
                        break;
                    case TransactionType.INVESTMENT:
                        summaryData[monthIndex].investment = amount;
                        break;
                }
            }
        });

        return summaryData;

    } catch (error) {
        console.error(`Error fetching yearly summary for ${year} from database:`, error);
        // On error, return the initialized array of zeros to avoid breaking the frontend chart
        return summaryData;
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const yearParam = searchParams.get('year');
        
        if (!yearParam) {
            return NextResponse.json({ error: "Year is a required query parameter." }, { status: 400 });
        }
        
        const year = parseInt(yearParam, 10);
        
        if (isNaN(year) || year < 2000 || year > 2100) {
            return NextResponse.json({ error: "Invalid year provided." }, { status: 400 });
        }

        const summaryData = await fetchYearlySummaryFromDB(year);

        return NextResponse.json({
            summaryData,
        });

    } catch (error) {
        console.error("Error in /api/yearly-summary:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
