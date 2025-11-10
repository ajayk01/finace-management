'use server';

import { NextResponse } from 'next/server';

// Helper function to make authenticated requests to Splitwise
async function fetchSplitwise(endpoint: string, apiKey: string) {
    const url = `https://secure.splitwise.com/api/v3.0/${endpoint}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        console.error(`Splitwise API error for endpoint ${endpoint}:`, { status: response.status, body: errorBody });
        throw new Error(`Splitwise API request failed with status ${response.status}`);
    }

    return response.json();
}

export async function GET() { 
    const  SPLITWISE_API_KEY  = "nhYfFpWs6ZpcgnlCUDbySBXCleWqbsi12sSC8mjP";

    // SPLITWISE_CONSUMER_KEY and SPLITWISE_CONSUMER_SECRET are not needed for API Key auth
    if (!SPLITWISE_API_KEY) {
        return NextResponse.json({ error: 'Splitwise API key is not configured.' }, { status: 500 });
    }

    try {
        const { groups } = await fetchSplitwise('get_groups', SPLITWISE_API_KEY);

        const groupsWithMembers = await Promise.all(
            (groups || []).map(async (group: any) => {
                const groupDetails = await fetchSplitwise(`get_group/${group.id}`, SPLITWISE_API_KEY);
                const members = groupDetails.group.members.map((member: any) => ({
                    id: member.id.toString(),
                    name: `${member.first_name} ${member.last_name || ''}`.trim(),
                }));
                return {
                    id: group.id.toString(),
                    name: group.name,
                    members: members,
                };
            })
        );
        console.log('Fetched groups with members:', groupsWithMembers);
        // Create a map with user ID vs name for all users across all groups
        const userIdToNameMap = new Map<string, string>();

        groupsWithMembers.forEach(group => {
            group.members.forEach((member: { id: string; name: string }) => {
                userIdToNameMap.set(member.id, member.name);
            });
        });


        return NextResponse.json({ groups: groupsWithMembers });

    } catch (error) {
        console.error('Error fetching Splitwise data:', error);
        return NextResponse.json({ error: 'Failed to fetch data from Splitwise.' }, { status: 500 });
    }
}