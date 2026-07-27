import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { insertExpenseTransaction } from '@/lib/db';
import { sendToAllDevices } from '@/lib/fcm';

interface ParsedTransaction 
{
  amount: number;
  accountLast4: string;
  description: string;
}

/**
 * Map account last 4 digits to account ID and name.
 * A single fromAddress can have multiple accounts (e.g. multiple CCs from same bank).
 */
const ACCOUNT_MAP: Record<string, { id: number; name: string }> = 
{
  '9003': { id: 9, name: 'ICICI Coral CC' },
  '1004': { id: 7, name: 'Amazon Pay ICICI CC' },
  '8789': { id: 3, name: 'HDFC Bank' },
  '2138': { id: 20, name: 'HDFC Diners Black' },
  '9615': { id: 18, name: 'Airtel Axis CC' },
  '1238': { id: 22, name: 'SBI Pulse CC' },
  '4674': { id: 23, name: 'HDFC PhonePe Ultimo' },
};

// ---------------------------------------------------------------------------
//  Per-sender parsers
//  Each parser takes the email text (summary or HTML) and returns a parsed
//  transaction or null. Multiple patterns per sender are supported because
//  a single fromAddress can send alerts for different cards / accounts.
// ---------------------------------------------------------------------------

type TransactionParser = (text: string) => ParsedTransaction | null;

function stripHtml(input: string): string {
  return (input || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDescription(input: string): string {
  return (input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(?:Date\s*:|UPI Transaction Reference Number\s*:|If not done by you|Warm Regards|Thanks and Regards).*$/i, '')
    .replace(/[|,;:\-\s]+$/g, '')
    .trim();
}

function parseTransactionFromSources(fromAddress: string, candidates: string[]): ParsedTransaction | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = parseTransaction(fromAddress, candidate);
    if (parsed) {
      return {
        ...parsed,
        description: cleanDescription(parsed.description),
      };
    }
  }
  return null;
}

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
 * HDFC Bank — credit card alerts.
 * "Rs. 5999.00 has been debited from your HDFC Bank Credit Card ending 2138 towards PETER ENGLAND on 23 May, 2026"
 */
const parseHDFCCreditCard: TransactionParser = (text) => {
  const pattern = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+has been debited from (?:your )?HDFC Bank Credit Card ending\s+(\d{4})\s+towards\s+(.+?)\s+on\s+/i;
  const m = text.match(pattern);
  if (!m) return null;
  return {
    amount: parseFloat(m[1].replace(/,/g, '')),
    accountLast4: m[2],
    description: m[3]?.trim() || '',
  };
};

/**
 * HDFC Bank - RuPay Credit Card UPI debit alerts.
 * "Rs.30.00 has been debited from your RuPay Credit Card (ending 4674) Paid to paytm... Date: 20-07-26 UPI Transaction Reference Number: 1266..."
 */
const parseHDFCRuPayUPI: TransactionParser = (text) => {
  const pattern = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+has been debited from your RuPay Credit Card\s*\(ending\s*(\d{4})\)\s*Paid to\s+(.+?)\s+Date\s*:/i;
  const m = text.match(pattern);
  if (!m) return null;

  const upiRefMatch = text.match(/UPI Transaction Reference Number\s*:?\s*(\d{6,})/i);
  const merchant = m[3]?.trim() || '';
  const upiRef = upiRefMatch?.[1] || '';

  return {
    amount: parseFloat(m[1].replace(/,/g, '')),
    accountLast4: m[2],
    description: upiRef ? `${cleanDescription(merchant)} | UPI Ref: ${upiRef}` : cleanDescription(merchant),
  };
};

/**
 * HDFC Bank — bank account debit / UPI alerts.
 * Pattern 1: "Rs.1304.05 is debited from your account ending 8789 towards VPA paytm-… on 28-05-26"
 * Pattern 2: "Rs.9048.00 has been debited from account 8789 to VPA cred.club@axisb CRED Club on 02-02-26"
 */
const parseHDFCBank: TransactionParser = (text) => {
  const pattern = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+(?:is|has been) debited from (?:your )?account(?: ending)?\s+(\d{4})\s+(?:towards|to)\s+(.+?)\s+on\s+/i;
  const m = text.match(pattern);
  if (!m) return null;
  return {
    amount: parseFloat(m[1].replace(/,/g, '')),
    accountLast4: m[2],
    description: m[3]?.trim() || '',
  };
};

/**
 * Axis Bank — credit card alerts (structured HTML format).
 * Extracts from subject pattern: "INR 6000 spent on credit card no. XX9615"
 * and HTML fields: "Transaction Amount:", "Merchant Name:", "Credit Card No."
 */
const parseAxisBank: TransactionParser = (text) => {
  // Try subject/summary pattern first: "INR 6000 spent on credit card no. XX9615"
  const subjectPattern = /INR\s*([\d,]+(?:\.\d{2})?)\s+spent on credit card no\.\s*XX(\d{4})/i;
  const subjectMatch = text.match(subjectPattern);
  if (!subjectMatch) return null;

  const amount = parseFloat(subjectMatch[1].replace(/,/g, ''));
  const accountLast4 = subjectMatch[2];

  // Try to extract merchant name from HTML structure
  const merchantPattern = /Merchant Name:\s*<\/div>\s*<div[^>]*>\s*(.+?)\s*(?:<br|<\/div)/i;
  const merchantMatch = text.match(merchantPattern);
  const description = merchantMatch?.[1]?.trim() || '';

  return { amount, accountLast4, description };
};

/**
 * SBI Card — credit card transaction alerts.
 * "Rs.101.00 spent on your SBI Credit Card ending 1238 at IILIndianRailwaysUT on 22/04/26."
 */
const parseSBICard: TransactionParser = (text) => {
  const pattern = /Rs\.?\s*([\d,]+(?:\.\d{2})?)\s+spent on your SBI Credit Card ending\s+(\d{4})\s+at\s+(.+?)\s+on\s+/i;
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
  { match: 'hdfcbank',  parsers: [parseHDFCCreditCard, parseHDFCRuPayUPI, parseHDFCBank] },
  { match: 'axis',      parsers: [parseAxisBank] },
  { match: 'sbicard',   parsers: [parseSBICard] },
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
    const summaryText: string = stripHtml(String(payload?.summary || ''));
    const htmlText: string = stripHtml(String(payload?.html || ''));
    const text: string = summaryText || htmlText;

    if (!text) {
      return NextResponse.json({ success: true, message: 'Webhook received, no content to parse' });
    }

    // Prefer summary parsing to avoid full-mail HTML noise in description.
    const parsed = parseTransactionFromSources(fromAddress, [summaryText, htmlText]);
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

export async function GET() 
{
  return NextResponse.json({ status: 'Zoho webhook is active' });
}
