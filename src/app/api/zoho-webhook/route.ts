import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { insertExpenseTransaction } from '@/lib/db';
import { sendToAllDevices } from '@/lib/fcm';

interface ParsedTransaction {
  amount: number;
  accountLast4: string;
  description: string;
}

/**
 * Map account last 4 digits to account ID and name.
 * A single fromAddress can have multiple accounts (e.g. multiple CCs from same bank).
 */
const ACCOUNT_MAP: Record<string, { id: number; name: string }> = {
  '9003': { id: 9, name: 'ICICI Coral CC' },
  '8789': { id: 3, name: 'HDFC Bank' },
};

// ---------------------------------------------------------------------------
//  Per-sender parsers
//  Each parser takes the email text (summary or HTML) and returns a parsed
//  transaction or null. Multiple patterns per sender are supported because
//  a single fromAddress can send alerts for different cards / accounts.
// ---------------------------------------------------------------------------

type TransactionParser = (text: string) => ParsedTransaction | null;

/**
 * ICICI Bank — credit card transaction alerts.
 * Pattern: "Credit Card XX9003 has been used for a transaction of INR 30.00 on … Info: UPI-…"
 */
const parseICICI: TransactionParser = (text) => {
  const pattern = /Credit Card\s+XX(\d{4})\s+has been used for a transaction of\s+INR\s+([\d,]+(?:\.\d{2})?)\s+on\s+.+?(?:Info:\s*(.+?))?(?:\.|<br)/i;
  const m = text.match(pattern);
  if (!m) return null;
  return {
    accountLast4: m[1],
    amount: parseFloat(m[2].replace(/,/g, '')),
    description: m[3]?.trim() || '',
  };
};

/**
 * HDFC Bank — debit / UPI alerts.
 * Pattern: "Rs.1304.05 is debited from your account ending 8789 towards VPA paytm-… (WEB UPI) on 28-05-26"
 */
const parseHDFC: TransactionParser = (text) => {
  const pattern = /Rs\.?([\d,]+(?:\.\d{2})?)\s+is debited from your account ending\s+(\d{4})\s+towards\s+(.+?)\s+on\s+/i;
  const m = text.match(pattern);
  if (!m) return null;
  return {
    amount: parseFloat(m[1].replace(/,/g, '')),
    accountLast4: m[2],
    description: m[3]?.trim() || '',
  };
};

/**
 * Registry: fromAddress substring → list of parsers to try (in order).
 * The first parser that returns a result wins.
 * Key is matched case-insensitively against the fromAddress.
 */
const SENDER_PARSERS: { match: string; parsers: TransactionParser[] }[] = [
  { match: 'icicibank', parsers: [parseICICI] },
  { match: 'hdfcbank',  parsers: [parseHDFC] },
];

/**
 * Parse transaction by looking up parsers for the given fromAddress.
 * Falls back to trying ALL parsers if fromAddress is unknown.
 */
function parseTransaction(fromAddress: string, text: string): ParsedTransaction | null {
  const from = (fromAddress || '').toLowerCase();

  // Find parsers matching this sender
  const matched = SENDER_PARSERS.filter((s) => from.includes(s.match));

  const parsersToTry = matched.length > 0
    ? matched.flatMap((s) => s.parsers)
    : SENDER_PARSERS.flatMap((s) => s.parsers); // fallback: try all

  for (const parser of parsersToTry) {
    const result = parser(text);
    if (result) return result;
  }
  return null;
}

function findAccount(last4: string): { id: number; name: string } | null {
  return ACCOUNT_MAP[last4] || null;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let payload: any;

    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    } else {
      payload = await request.text();
    }

    console.log('📧 Zoho Webhook received:', JSON.stringify(payload, null, 2));

    const fromAddress: string = payload?.fromAddress || payload?.from || '';
    const text: string = payload?.summary || payload?.html || '';

    if (!text) {
      return NextResponse.json({ success: true, message: 'Webhook received, no content to parse' });
    }

    const parsed = parseTransaction(fromAddress, text);
    if (!parsed) {
      console.log('⚠️ Could not parse transaction from email');
      return NextResponse.json({ success: true, message: 'Webhook received, could not parse transaction' });
    }

    console.log('💳 Parsed transaction:', parsed);

    // Find account by last 4 digits
    const account = findAccount(parsed.accountLast4);
    if (!account) {
      console.warn(`⚠️ No account found ending with ${parsed.accountLast4}`);
      // Still send notification even if account not found
      try {
        await sendToAllDevices(
          'Add Transaction',
          `Transaction Amount: ₹${parsed.amount}, Account: XX${parsed.accountLast4} (not mapped), Description: ${parsed.description || 'N/A'}`,
          { accountLast4: parsed.accountLast4, amount: String(parsed.amount), description: parsed.description }
        );
      } catch (e) { console.error('FCM error:', e); }

      return NextResponse.json({ success: true, message: 'Transaction parsed but account not found', parsed });
    }

    // Insert expense transaction
    const txId = await insertExpenseTransaction({
      accountId: account.id,
      amount: parsed.amount,
      description: parsed.description || undefined,
    });

    console.log(`✅ Inserted transaction ${txId} for ${account.name}`);

    // Send push notification to all registered devices
    const notifMessage = `Transaction Amount: ₹${parsed.amount}, Account: ${account.name}${parsed.description ? `, Description: ${parsed.description}` : ''}`;
    try {
      await sendToAllDevices(
        'Add Transaction',
        notifMessage,
        { transactionId: String(txId), accountId: String(account.id), amount: String(parsed.amount), description: parsed.description }
      );
      console.log('📲 Push notification sent');
    } catch (e) {
      console.error('FCM notification error:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Transaction inserted and notification sent',
      transaction: { id: txId, amount: parsed.amount, account: account.name, description: parsed.description },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Webhook processing failed';
    console.error('Zoho webhook error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Zoho webhook is active' });
}
