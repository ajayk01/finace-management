import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { query } from '@/lib/db';

function getProjectId() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set');
  return projectId;
}

async function getAccessToken() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set');
  }

  const auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function sendFCM(token: string, title: string, body: string, data?: Record<string, string>) {
  const projectId = getProjectId();
  const accessToken = await getAccessToken();

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const payload = {
    message: {
      token,
      notification: { title, body },
      android: {
        priority: 'HIGH' as const,
        notification: { channel_id: 'default' },
      },
      data: data || {},
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || JSON.stringify(result));
  }

  return result;
}

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
