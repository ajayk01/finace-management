import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const users = await query('SELECT * FROM User WHERE NAME = ? AND PASS = ?', [username, password]);

    if (users.length === 0) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true, username: users[0].NAME });

    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.userId = users[0].ID || 1;
    session.username = users[0].NAME;
    session.isLoggedIn = true;
    await session.save();

    return response;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Login failed';
    console.error('Login error:', errMsg);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
