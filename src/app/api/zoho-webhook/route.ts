import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

    return NextResponse.json({ success: true, message: 'Webhook received' });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Webhook processing failed';
    console.error('Zoho webhook error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Zoho webhook is active' });
}
