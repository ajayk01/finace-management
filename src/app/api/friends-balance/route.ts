'use server';

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const refreshParam = url.searchParams.get('refresh');
    
    // Construct external backend URL
    const externalUrl = new URL('http://192.168.1.4:8080/api/friends-balance');
    if (refreshParam) {
      externalUrl.searchParams.set('refresh', refreshParam);
    }

    // Proxy the request to external backend
    const response = await fetch(externalUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': request.headers.get('Accept') || 'application/json',
        ...(request.headers.get('Cookie') && { 'Cookie': request.headers.get('Cookie')! }),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        errorData || { error: `Backend returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying to friends-balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch friends balance' },
      { status: 500 }
    );
  }
}
