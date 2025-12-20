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
}

async function fetchCreditCardCapsFromDB(creditCardId?: string) {
  try {
    let sql = `
      SELECT 
        ID,
        CREDIT_CARD_ID,
        CAP_NAME,
        CAP_TOTAL_AMOUNT,
        CAP_PERCENTAGE,
        CAP_CURRENT_AMOUNT
      FROM CreditCardCapDetails
    `;
    
    const params: any[] = [];
    
    if (creditCardId) {
      sql += ' WHERE CREDIT_CARD_ID = ?';
      params.push(creditCardId);
    }
    
    sql += ' ORDER BY CAP_NAME';
    console.log("Executing SQL:", sql, "with params:", params);
    const caps = await query<any>(sql, params);
    
    return caps.map((cap: any) => ({
      id: cap.ID.toString(),
      creditCardId: cap.CREDIT_CARD_ID.toString(),
      capName: cap.CAP_NAME,
      capTotalAmount: cap.CAP_TOTAL_AMOUNT,
      capPercentage: cap.CAP_PERCENTAGE,
      capCurrentAmount: cap.CAP_CURRENT_AMOUNT,
      remainingAmount: cap.CAP_TOTAL_AMOUNT - cap.CAP_CURRENT_AMOUNT,
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
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedData = addCapSchema.parse(body);
    const { creditCardId, capName, capTotalAmount, capPercentage } = parsedData;

    const sql = `
      INSERT INTO CreditCardCapDetails (
        CREDIT_CARD_ID,
        CAP_NAME,
        CAP_TOTAL_AMOUNT,
        CAP_PERCENTAGE,
        CAP_CURRENT_AMOUNT
      ) VALUES (?, ?, ?, ?, ?)
    `;

    const result: any = await query(sql, [
      parseInt(creditCardId),
      capName,
      capTotalAmount,
      capPercentage,
      0, // Initial current amount is 0
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
