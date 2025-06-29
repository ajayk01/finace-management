import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import type { SessionOptions } from 'iron-session';

export interface SessionData {
  username: string;
  isLoggedIn: boolean;
}

// No longer exporting sessionOptions to avoid Edge runtime issues.
// Options are now defined locally where they are used.

export async function getSession(): Promise<IronSession<SessionData>> {
  const sessionOptions: SessionOptions = {
    password: process.env.SESSION_SECRET as string,
    cookieName: 'finance-app-session',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
    },
  };

  if (
    !sessionOptions.password ||
    (typeof sessionOptions.password === 'string' && sessionOptions.password.length < 32)
  ) {
    console.error('SESSION_SECRET environment variable is not set or is too short in a server-side context.');
    // In a real app, you might want to throw an error here,
    // but for now, we'll let it proceed, and authentication will fail gracefully.
  }
  
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  return session;
}
