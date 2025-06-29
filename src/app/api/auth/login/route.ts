import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { getSession } from '@/lib/session';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const NOTION_USERS_DB_ID = process.env.NOTION_USERS_DB_ID;

export async function POST(request: NextRequest) {
  if (!NOTION_USERS_DB_ID) {
    return NextResponse.json({ error: "Users database is not configured." }, { status: 500 });
  }
  if (!process.env.NOTION_API_KEY) {
      return NextResponse.json({ error: "Notion API key is not configured." }, { status: 500 });
  }

    const session = await getSession();
    const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  try {
    const response = await notion.databases.query({
      database_id: NOTION_USERS_DB_ID,
      filter: {
        property: 'Name',
        title: {
          equals: username,
        },
      },
    });

    if (response.results.length === 0) {
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }

    const userPage: any = response.results[0];
    const storedPassword = userPage.properties.Password?.rich_text[0]?.plain_text;

    if (password !== storedPassword) {
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }

    // Passwords match, create session
    session.username = username;
    session.isLoggedIn = true;
    await session.save();
    console.log(`User ${username} logged in successfully.`);
    return NextResponse.json({ success: true, user: { username } });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}
