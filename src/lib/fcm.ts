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

export async function sendFCM(token: string, title: string, body: string, data?: Record<string, string>) {
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

/**
 * Send a push notification to all registered devices.
 */
export async function sendToAllDevices(title: string, body: string, data?: Record<string, string>) {
  const devices = await query('SELECT TOKEN FROM FCM_TOKENS');
  const results = [];

  for (const device of devices) {
    try {
      const res = await sendFCM(device.TOKEN, title, body, data);
      results.push({ success: true, messageId: res.name });
    } catch (err) {
      console.error('FCM send failed for a device:', err);
      results.push({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return results;
}
