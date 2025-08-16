
'use server';

import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const NOTION_FRIENDS_DB_ID = process.env.SPLITWISE_USERS_DB_ID;

// Cache configuration
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds
let splitwiseCache: { data: any; timestamp: number } | null = null;

interface FriendBalance {
    name: string;
    splitwiseAmount: number | null;
    notionAmount: number | null;
}

// Helper to check if cache is valid
function isCacheValid(): boolean {
    return splitwiseCache !== null && (Date.now() - splitwiseCache.timestamp) < CACHE_TTL;
}

// Helper to clear cache (useful for debugging or forced refresh)
function clearCache(): void {
    splitwiseCache = null;
    console.log('Splitwise cache cleared');
}

// Helper to fetch data from Splitwise with caching
async function fetchSplitwiseWithCache(endpoint: string, apiKey: string) {
    // Return cached data if valid
    if (isCacheValid()) {
        console.log('Using cached Splitwise data');
        return splitwiseCache!.data;
    }

    console.log('Fetching fresh Splitwise data');
    const url = `https://secure.splitwise.com/api/v3.0/${endpoint}`;
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            cache: 'no-store' // Avoid caching sensitive data
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error(`Splitwise API error for ${endpoint}:`, { status: response.status, body: errorBody });
            throw new Error(`Splitwise API request failed with status ${response.status}`);
        }
        const data = await response.json();
        
        // Update cache
        splitwiseCache = {
            data,
            timestamp: Date.now()
        };
        
        return data;
    } catch (error) {
        console.error(`Error fetching from Splitwise endpoint ${endpoint}:`, error);
        throw error;
    }
}

// Helper to fetch friends from Notion
async function fetchNotionFriends() {
    if (!NOTION_FRIENDS_DB_ID) {
        // Return empty array if the database ID is not configured, it's not a fatal error
        console.warn("NOTION_FRIENDS_DB_ID is not configured. Notion friends data will be empty.");
        return [];
    }
    try {
        const response = await notion.databases.query({
            database_id: NOTION_FRIENDS_DB_ID,
        });
        return response.results.map((page: any) => {
            const name = page.properties?.Name?.title?.[0]?.plain_text || null;
            const balance = page.properties?.Total_Owns?.formula?.number ?? null;
            return { name, balance };
        }).filter(friend => friend.name); // Only include friends with a name
    } catch (error) {
        console.error("Error fetching friends from Notion:", error);
        throw new Error("Failed to fetch friends data from Notion.");
    }
}

export async function GET(request: Request) {
    const { SPLITWISE_API_KEY, NOTION_API_KEY } = process.env;

    if (!SPLITWISE_API_KEY) {
        return NextResponse.json({ error: 'Splitwise API key is not configured.' }, { status: 500 });
    }
    if (!NOTION_API_KEY) {
        return NextResponse.json({ error: 'Notion API key is not configured.' }, { status: 500 });
    }

    try {
        // Check for force refresh parameter
        const url = new URL(request.url);
        const forceRefresh = url.searchParams.get('refresh') === 'true';
        
        if (forceRefresh) {
            clearCache();
        }
        const [splitwiseData, notionFriends] = await Promise.all([
            fetchSplitwiseWithCache('get_friends', SPLITWISE_API_KEY),
            fetchNotionFriends()
        ]);

        const splitwiseFriends = splitwiseData.friends || [];
        
        const mergedFriends: Record<string, FriendBalance> = {};

        // Process Splitwise friends
        splitwiseFriends.forEach((friend: any) => {
            const name = `${friend.first_name} ${friend.last_name || ''}`.trim();
            if (name && friend.balance?.[0]?.amount) {
                 if (!mergedFriends[name]) {
                    mergedFriends[name] = { name, splitwiseAmount: null, notionAmount: null };
                }
                mergedFriends[name].splitwiseAmount = parseFloat(friend.balance[0].amount);
            }
        });

        // Process and merge Notion friends
        notionFriends.forEach(friend => {
            if (friend.name) {
                if (!mergedFriends[friend.name]) {
                    mergedFriends[friend.name] = { name: friend.name, splitwiseAmount: null, notionAmount: null };
                }
                mergedFriends[friend.name].notionAmount = friend.balance;
            }
        });

        const friends = Object.values(mergedFriends)
          .filter(f => f.splitwiseAmount !== null && f.notionAmount !== null) // Only show friends with entries in both systems
          .sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ friends });

    } catch (error) {
        console.error('Error fetching or merging friends balance data:', error);
        return NextResponse.json({ error: 'Failed to fetch or process friends balance data.' }, { status: 500 });
    }
}

    