import { Client } from '@notionhq/client';

/**
 * Fetches all pages from a Notion database with pagination support
 * @param notion Notion client instance
 * @param databaseId The ID of the database to query
 * @param options Additional query options (filter, sorts, etc)
 * @returns Array of all pages from the database
 */
export async function fetchAllPagesFromNotion(
  notion: Client,
  databaseId: string,
  options: any = {}
) {
  let allResults: any[] = [];
  let hasMore = true;
  let nextCursor: string | undefined = undefined;

  while (hasMore) {
    const response = await notion.databases.query({
      database_id: databaseId,
      ...options,
      ...(nextCursor && { start_cursor: nextCursor }),
      page_size: 100,
    });

    allResults = [...allResults, ...response.results];
    hasMore = response.has_more;
    nextCursor = response.next_cursor ?? undefined;
  }

  return allResults;
}
