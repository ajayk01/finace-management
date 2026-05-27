import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query } from '@/lib/db';



// GET — list all registered devices
export async function GET() {
  try {
    const rows = await query('SELECT ID, DEVICE_NAME, CREATED_AT, UPDATED_AT FROM FCM_TOKENS ORDER BY UPDATED_AT DESC');
    return NextResponse.json({ devices: rows });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch devices';
    console.error('FCM tokens GET error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// POST — register or update a device token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceName, token } = body;

    if (!deviceName || !token) {
      return NextResponse.json({ error: 'deviceName and token are required' }, { status: 400 });
    }

    // Upsert: if device name exists, update token; otherwise insert
    const existing = await query('SELECT ID FROM FCM_TOKENS WHERE DEVICE_NAME = ?', [deviceName]);

    if (existing.length > 0) {
      await query('UPDATE FCM_TOKENS SET TOKEN = ? WHERE DEVICE_NAME = ?', [token, deviceName]);
      return NextResponse.json({ success: true, message: 'Token updated', id: existing[0].ID });
    } else {
      const result = await query('INSERT INTO FCM_TOKENS (DEVICE_NAME, TOKEN) VALUES (?, ?)', [deviceName, token]);
      return NextResponse.json({ success: true, message: 'Device registered', id: result.insertId });
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to register device';
    console.error('FCM tokens POST error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// DELETE — remove a device
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Device id is required' }, { status: 400 });
    }

    await query('DELETE FROM FCM_TOKENS WHERE ID = ?', [id]);
    return NextResponse.json({ success: true, message: 'Device removed' });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to delete device';
    console.error('FCM tokens DELETE error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
