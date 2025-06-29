import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import type { SessionOptions } from 'iron-session';
import type { SessionData } from './lib/session';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Define options inside the middleware to be compatible with Vercel Edge.
  const sessionOptions: SessionOptions = {
    password: process.env.SESSION_SECRET as string,
    cookieName: 'finance-app-session',
    cookieOptions: {
      // The Edge runtime doesn't have process.env.NODE_ENV,
      // so we check the protocol to determine if the cookie should be secure.
      secure: request.url.startsWith('https://'),
    },
  };

  if (
    !sessionOptions.password ||
    (typeof sessionOptions.password === 'string' && sessionOptions.password.length < 32)
  ) {
    console.error('CRITICAL: SESSION_SECRET environment variable is not set or is too short. It must be at least 32 characters long.');
    // Return a generic error to the user for security reasons.
    return new NextResponse('Internal Server Error: Application is not configured correctly.', {
      status: 500,
    });
  }

  const session = await getIronSession<SessionData>(request.cookies, sessionOptions);

  const { isLoggedIn } = session;
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith('/login');

  // If user is logged in
  if (isLoggedIn) {
    // and tries to access an auth page, redirect to dashboard
    if (isAuthPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    // otherwise, let them proceed
    return response;
  }

  // If user is not logged in
  // and tries to access a protected page, redirect to login
  if (!isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // and tries to access an auth page, let them proceed
  return response;
}

export const config = {
  // Match all routes except for API routes, static files, and image optimization files
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
