import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sendFCM } from '@/lib/fcm';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, deviceId, title, body: messageBody, data } = body;

    let fcmToken = token;

    // If deviceId is provided, look up the token from DB
    if (!fcmToken && deviceId) {
      const rows = await query('SELECT TOKEN FROM FCM_TOKENS WHERE ID = ?', [deviceId]);
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Device not found' }, { status: 404 });
      }
      fcmToken = rows[0].TOKEN;
    }

    if (!fcmToken) {
      return NextResponse.json({ error: 'FCM device token or deviceId is required' }, { status: 400 });
    }

    const result = await sendFCM(
      fcmToken,
      title || 'Finance Manager',
      messageBody || 'You have a new notification from Finance Manager!',
      data,
    );

    return NextResponse.json({ success: true, messageId: result.name });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to send notification';
    console.error('FCM send error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// GET — send a sample notification (requires ?token=<device_token>)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Provide FCM device token as ?token=<device_token>' },
        { status: 400 },
      );
    }

    const result = await sendFCM(
      token,
      'Hello from Finance Manager',
      'This is a sample push notification sent from the server!',
      { type: 'sample', timestamp: new Date().toISOString() },
    );

    return NextResponse.json({ success: true, messageId: result.name });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to send notification';
    console.error('FCM send error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
