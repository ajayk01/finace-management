import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { z } from 'zod';

export interface CreditCardCap {
  id: string;
  creditCardId: string;
  capName: string;
  capTotalAmount: number;
  capPercentage: number;
  capCurrentAmount: number;
  remainingAmount: number;
  totalRewards: number;
  rewardPerAmount: number;
}

async function fetchCreditCardCapsFromDB(creditCardId?: string) {
  try {
    // Get current month start/end timestamps
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    let sql = `
      SELECT 
        ccd.ID,
        ccd.CREDIT_CARD_ID,
        ccd.CAP_NAME,
        ccd.CAP_TOTAL_AMOUNT,
        ccd.CAP_PERCENTAGE,
        ccd.CAP_CURRENT_AMOUNT,
        ccd.REWARD_PER_AMOUNT,
        COALESCE(rewards.TOTAL_REWARDS, 0) AS TOTAL_REWARDS
      FROM CreditCardCapDetails ccd
      LEFT JOIN (
        SELECT CapId, CreditCardId, SUM(Rewards) AS TOTAL_REWARDS
        FROM CreditCardTransactions cct
        INNER JOIN Transactions t ON cct.TransactionId = t.ID
        WHERE t.DATE >= ? AND t.DATE <= ?
        GROUP BY CapId, CreditCardId
      ) rewards ON ccd.ID = rewards.CapId AND ccd.CREDIT_CARD_ID = rewards.CreditCardId
    `;
    
    const params: any[] = [monthStart, monthEnd];
    
    if (creditCardId) {
      sql += ' WHERE ccd.CREDIT_CARD_ID = ?';
      params.push(creditCardId);
    }
    
    sql += ' ORDER BY ccd.CAP_NAME';
    console.log("Executing SQL:", sql, "with params:", params);
    const caps = await query<any>(sql, params);
    
    return caps.map((cap: any) => ({
      id: cap.ID.toString(),
      creditCardId: cap.CREDIT_CARD_ID.toString(),
      capName: cap.CAP_NAME,
      capTotalAmount: Math.trunc(Number(cap.CAP_TOTAL_AMOUNT) || 0),
      capPercentage: cap.CAP_PERCENTAGE,
      capCurrentAmount: Math.trunc(Number(cap.CAP_CURRENT_AMOUNT) || 0),
      remainingAmount:
        Math.trunc(Number(cap.CAP_TOTAL_AMOUNT) || 0) - Math.trunc(Number(cap.CAP_CURRENT_AMOUNT) || 0),
      totalRewards: Number(cap.TOTAL_REWARDS) || 0,
      rewardPerAmount: Number(cap.REWARD_PER_AMOUNT) || 100,
    }));
  } catch (error) {
    console.error("Error fetching credit card caps from database:", error);
    throw new Error("Failed to fetch credit card caps from database.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const creditCardId = searchParams.get('creditCardId');
    
    const caps = await fetchCreditCardCapsFromDB(creditCardId || undefined);
    
    return NextResponse.json({
      caps,
    });
  } catch (error) {
    console.error("Error in /api/credit-card-caps:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while fetching credit card caps.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

const addCapSchema = z.object({
  creditCardId: z.string(),
  capName: z.string(),
  capTotalAmount: z.number(),
  capPercentage: z.number(),
  rewardPerAmount: z.number().default(100),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedData = addCapSchema.parse(body);
    const { creditCardId, capName, capTotalAmount, capPercentage, rewardPerAmount } = parsedData;

    const sql = `
      INSERT INTO CreditCardCapDetails (
        CREDIT_CARD_ID,
        CAP_NAME,
        CAP_TOTAL_AMOUNT,
        CAP_PERCENTAGE,
        CAP_CURRENT_AMOUNT,
        REWARD_PER_AMOUNT
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result: any = await query(sql, [
      parseInt(creditCardId),
      capName,
      capTotalAmount,
      capPercentage,
      0, // Initial current amount is 0
      rewardPerAmount,
    ]);

    const insertedId = result?.insertId || result?.[0]?.insertId || 0;

    return NextResponse.json({
      success: true,
      message: 'Credit card cap added successfully.',
      capId: insertedId,
    });
  } catch (error) {
    console.error("Error in POST /api/credit-card-caps:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding credit card cap.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
