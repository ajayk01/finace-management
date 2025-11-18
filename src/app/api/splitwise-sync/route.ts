'use server';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const SPLITWISE_API_KEY = process.env.SPLITWISE_API_KEY;
const SPLITWISE_CURRENT_USER_ID = process.env.SPLITWISE_CURRENT_USER_ID || "57391213";
// Helper function to make authenticated requests to Splitwise
async function fetchSplitwise(endpoint: string) 
{
    const url = `https://secure.splitwise.com/api/v3.0/${endpoint}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${SPLITWISE_API_KEY}`,
            'Content-Type': 'application/json'
        },
        cache: 'no-store'
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        console.error(`Splitwise API error for endpoint ${endpoint}:`, { status: response.status, body: errorBody });
        throw new Error(`Splitwise API request failed with status ${response.status}`);
    }

    return response.json();
}

export async function GET() 
{
    if (!SPLITWISE_API_KEY) 
    {
        return NextResponse.json({ error: 'Splitwise API key is not configured.' }, { status: 500 });
    }

    try {
        // Get the last sync time from the database
        const syncTimeResult = await query<{ TIME: bigint }>(
            'SELECT TIME FROM SplitwiseSyncTime'
        );
        console.log("Sync Time : ",syncTimeResult);
        let lastSyncTime: bigint | null = null;
        if (Array.isArray(syncTimeResult) && syncTimeResult.length > 0) 
        {
            lastSyncTime = syncTimeResult[0].TIME;
        }

        // Fetch notifications from Splitwise with adaptive limit
        let limit = 50;
        let notifications: any[] = [];
        let allNotifications: any[] = [];
        
        // Keep increasing limit until we find notifications after last sync time
        while (notifications.length === 0 && limit <= 200) 
        {
            let endpoint = 'get_notifications';
            if (lastSyncTime) 
            {
                // Convert bigint timestamp to ISO 8601 format for Splitwise API
                const lastSyncDate = new Date(Number(lastSyncTime)).toISOString();
                console.log("Last Sync Date : ",lastSyncDate);
                endpoint = `get_notifications?limit=${limit}`;
            }

            const notificationsData = await fetchSplitwise(endpoint);
            allNotifications = notificationsData.notifications || [];
            
            // Since notifications are returned newest first, check if the oldest notification is still after lastSyncTime
            // If yes, we might need more notifications. If no, we've gone past lastSyncTime.
            let oldestNotificationTime = allNotifications.length > 0 
                ? new Date(allNotifications[allNotifications.length - 1].created_at).getTime() 
                : 0;
            
            // Filter notifications:
            // 1. Created by others (not by current user)
            // 2. Created after the last sync time (skip old notifications)
            notifications = allNotifications.filter((notification: any) => {
                // Check if created by others
                const isFromOthers = notification.created_by && 
                                     SPLITWISE_CURRENT_USER_ID && 
                                     notification.created_by.toString() !== SPLITWISE_CURRENT_USER_ID;
                
                // Check if created after last sync time
                const isAfterLastSync = !lastSyncTime || 
                                        (notification.created_at && 
                                         new Date(notification.created_at).getTime() > Number(lastSyncTime));
                
                return isFromOthers && isAfterLastSync;
            });

            console.log(`Limit: ${limit}, Total notifications: ${allNotifications.length}, Filtered (from others & after last sync): ${notifications.length}`);
            console.log(`Oldest notification time: ${oldestNotificationTime}, Last sync time: ${lastSyncTime}`);
            
            // Break conditions:
            // 1. No notifications returned at all - nothing more to fetch
            if (allNotifications.length === 0) {
                console.log('No notifications returned, stopping.');
                break;
            }
            
            
            // 3. Oldest notification is older than lastSyncTime - we've gone past the sync point
            if (lastSyncTime && oldestNotificationTime <= Number(lastSyncTime)) {
                console.log('Reached notifications older than last sync time, stopping.');
                break;
            }
            
            // If we're here: no filtered results, but oldest notification is still after lastSyncTime
            // This means all notifications are from current user, increase limit to find others
            limit += 50;
            console.log(`All notifications from current user, increasing limit to ${limit}`);
        }

        // Process notifications and fetch expense details
        const processedNotifications = [];
        const expenseDetails = [];

        for (const notification of notifications) {
            // Check if source type is Expense
            if (notification.source && 
                notification.source.type === 'Expense' && 
                notification.source.id) {
                
                try {
                    // Fetch expense details
                    const expenseData = await fetchSplitwise(`get_expense/${notification.source.id}`);
                    const expense = expenseData.expense;
                    
                    // Format date as DD-MM-YYYY
                    const expenseDate = new Date(expense.date);
                    const formattedDate = `${String(expenseDate.getDate()).padStart(2, '0')}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}-${expenseDate.getFullYear()}`;
                    
                    // Find current user's share from repayments
                    let userAmount = 0;
                    if (expense.repayments && Array.isArray(expense.repayments)) {
                        for (const repayment of expense.repayments) {
                            if (repayment.from.toString() === SPLITWISE_CURRENT_USER_ID) {
                                userAmount = parseFloat(repayment.amount);
                                break;
                            }
                        }
                    }
                    
                    expenseDetails.push({
                        friendId: Number(notification.created_by),
                        date: formattedDate,
                        amount: userAmount,
                        expenseId: notification.source.id
                    });
                    
                    console.log(`Fetched expense ${notification.source.id}: ${formattedDate} - ${expense.description} - ₹${userAmount}`);
                } catch (error) {
                    console.error(`Failed to fetch expense ${notification.source.id}:`, error);
                }
            }
            
            processedNotifications.push(notification);
        }

        console.log("Processed expense details:", expenseDetails);

        // Get current timestamp
        const currentTimestamp = BigInt(Date.now());
        for(const detail of expenseDetails)
        {
            console.log(`Expense ID: ${detail.expenseId}, Date: ${detail.date}, Amount: ₹${detail.amount}, Friend ID: ${detail.friendId}`);
            // Use parameterized query to avoid SQL injection and proper type handling
            const res = await query('Select ID from SplitwiseFriends where SPLITWISE_FRIEND_ID = ?', [detail.friendId]);
            const friendId = res.length > 0 ? res[0].ID : 0;
            await query(
                'INSERT INTO SplitwiseTransactions (SPLITWISE_TRANSACTION_ID, FRIEND_ID, SPLITED_AMOUNT) VALUES (?, ?, ?)',
                [detail.expenseId, friendId, detail.amount]
            );
            
            console.log(`Inserted expense ${detail.expenseId} into database`);
        }

        // Update sync time in database
        await query(
            'DELETE FROM SplitwiseSyncTime'
        );
        console.log("Current Timestamp : ",currentTimestamp.toString());
        await query('INSERT INTO SplitwiseSyncTime VALUES ('+currentTimestamp.toString()+')');

        // Return the notifications and sync info
        return NextResponse.json({
            success: true
        });

    } catch (error) {
        console.error('Error syncing Splitwise data:', error);
        return NextResponse.json({ 
            error: 'Failed to sync data from Splitwise.',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function POST() {
    // Allow POST method as well for sync operations
    return GET();
}
