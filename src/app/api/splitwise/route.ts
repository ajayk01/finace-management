'use server';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { SplitwiseFriend } from '@/types/database';
import { getSplitwiseCookie, missingSplitwiseCookieResponse, splitwiseCookieHeaders } from '@/lib/splitwise-auth';

// Helper function to make authenticated requests to Splitwise
async function fetchSplitwise(endpoint: string, cookie: string) {
    const url = `https://secure.splitwise.com/api/v3.0/${endpoint}`;
    const response = await fetch(url, {
        headers: splitwiseCookieHeaders(cookie, 'application/json')
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        console.error(`Splitwise API error for endpoint ${endpoint}:`, { status: response.status, body: errorBody });
        throw new Error(`Splitwise API request failed with status ${response.status}`);
    }

    return response.json();
}

export async function GET(request: Request) {
    const cookie = getSplitwiseCookie(request);
    if (!cookie) {
        return missingSplitwiseCookieResponse();
    }

    try {
        const dbFriends = await query<SplitwiseFriend>(
            'SELECT ID, SPLITWISE_FRIEND_ID, NAME FROM SplitwiseFriends'
        );
        const splitwiseFriendIdToDbId = new Map<string, number>();
        dbFriends.forEach((friend: SplitwiseFriend) => {
            if (friend.SPLITWISE_FRIEND_ID !== null && friend.SPLITWISE_FRIEND_ID !== undefined) {
                splitwiseFriendIdToDbId.set(String(friend.SPLITWISE_FRIEND_ID), friend.ID);
            }
        });

        const { groups } = await fetchSplitwise('get_groups', cookie);

        const groupsWithMembers = (groups || []).map((group: any) => ({
            id: group.id.toString(),
            name: group.name,
            members: (group.members || []).map((member: any) => ({
                id: member.id.toString(),
                friendId: splitwiseFriendIdToDbId.get(member.id.toString()) ?? null,
                name: `${member.first_name} ${member.last_name || ''}`.trim(),
            })),
        }));

        return NextResponse.json({ groups: groupsWithMembers });

    } catch (error) {
        console.error('Error fetching Splitwise data:', error);
        return NextResponse.json({ error: 'Failed to fetch data from Splitwise.' }, { status: 500 });
    }
}