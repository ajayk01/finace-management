import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// --- Groww API types ---

interface GrowwSearchResult {
  scheme_code: string;
  title: string;
  search_id: string;
}

interface GrowwSearchResponse {
  content: GrowwSearchResult[];
}

// MF NAV response: { folio: { name: string, data: [[timestamp_ms, nav], ...] } }
interface GrowwMFNavResponse {
  folio: {
    name: string;
    data: [number, number][]; // [timestamp_ms, nav]
  };
}

// Nifty 50 response: { candles: [[timestamp_sec, close], ...] }
interface GrowwNiftyResponse {
  candles: [number, number][]; // [timestamp_sec, close]
}

// Period -> months param for MF NAV API
const PERIOD_TO_MONTHS: Record<string, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
  '3y': 36,
  '5y': 60,
  'all': 240, // 20 years as max
};

// Period -> Nifty charting service: use '1y' for anything ≤1y, otherwise use the actual range
// Groww only supports: 1y, 3y, 5y, 10y for historical daily data
const PERIOD_TO_NIFTY_RANGE: Record<string, string> = {
  '1m': '1y',
  '3m': '1y',
  '6m': '1y',
  '1y': '1y',
  '3y': '3y',
  '5y': '5y',
  'all': '10y',
};

// Interval in days for Nifty data (higher for longer periods to keep data manageable)
const PERIOD_TO_INTERVAL: Record<string, number> = {
  '1m': 1,
  '3m': 1,
  '6m': 1,
  '1y': 1,
  '3y': 3,
  '5y': 5,
  'all': 7,
};

// Cutoff months for filtering Nifty data when we fetch more than needed
const PERIOD_TO_CUTOFF_MONTHS: Record<string, number | null> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': null, // exact match, no filtering needed
  '3y': null,
  '5y': null,
  'all': null,
};

/**
 * Fetch Nifty 50 index data from Groww charting service.
 * For periods < 1y, fetches 1y data and filters to the desired cutoff.
 * Returns a Map of YYYY-MM-DD -> closing price.
 */
async function fetchNifty50Data(period: string): Promise<Map<string, number>> {
  const range = PERIOD_TO_NIFTY_RANGE[period] || '1y';
  const interval = PERIOD_TO_INTERVAL[period] || 1;
  const url = `https://groww.in/v1/api/charting_service/v2/chart/exchange/NSE/segment/CASH/NIFTY/${range}?intervalInDays=${interval}&minimal=true`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Groww Nifty API returned ${res.status}`);
  }

  const data: GrowwNiftyResponse = await res.json();
  const candles = data?.candles || [];

  // Calculate cutoff date for short periods (we fetched 1y but only need 1m/3m/6m)
  const cutoffMonths = PERIOD_TO_CUTOFF_MONTHS[period] ?? null;
  let cutoffDate: Date | null = null;
  if (cutoffMonths !== null) {
    const now = new Date();
    cutoffDate = new Date(now.getFullYear(), now.getMonth() - cutoffMonths, now.getDate());
  }

  const navMap = new Map<string, number>();
  for (const [timestampSec, close] of candles) {
    if (close === null || close === undefined) continue;
    const date = new Date(timestampSec * 1000);
    if (cutoffDate && date < cutoffDate) continue;
    const key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    navMap.set(key, parseFloat(close.toFixed(2)));
  }

  return navMap;
}

/**
 * Fetch MF NAV graph data from Groww.
 * Returns fund name and a Map of YYYY-MM-DD -> NAV.
 */
async function fetchMFNavData(schemeCode: string, period: string): Promise<{ name: string; navMap: Map<string, number> }> {
  const months = PERIOD_TO_MONTHS[period] || 12;
  const url = `https://groww.in/v1/api/data/mf/web/v1/scheme/${schemeCode}/graph?benchmark=false&months=${months}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Groww MF NAV API returned ${res.status}`);
  }

  const data: GrowwMFNavResponse = await res.json();
  const folio = data?.folio;
  if (!folio) throw new Error('No folio data returned from Groww');

  const navMap = new Map<string, number>();
  for (const [timestampMs, nav] of folio.data) {
    if (nav === null || nav === undefined) continue;
    const date = new Date(timestampMs);
    const key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    navMap.set(key, parseFloat(nav.toFixed(4)));
  }

  return { name: folio.name, navMap };
}

/**
 * GET /api/mf-nav-data?schemeCode=122639&period=1y
 * Fetches NAV history for the given MF scheme (via Groww) and Nifty 50 index (via Groww charting service).
 *
 * GET /api/mf-nav-data?search=parag+parikh
 * Searches mutual funds via Groww search API.
 *
 * period: 1m, 3m, 6m, 1y, 3y, 5y, all (default: 1y)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schemeCode = searchParams.get('schemeCode');
    const search = searchParams.get('search');
    const period = searchParams.get('period') || '1y';

    // --- Search mode ---
    if (search) {
      const res = await fetch(
        `https://groww.in/v1/api/search/v1/entity?app=false&entity_type=scheme&page=0&q=${encodeURIComponent(search)}&size=20`
      );
      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to search mutual funds' }, { status: 502 });
      }
      const data: GrowwSearchResponse = await res.json();
      const results = (data.content || []).map((item) => ({
        schemeCode: parseInt(item.scheme_code, 10),
        schemeName: item.title,
      }));
      return NextResponse.json({ results });
    }

    // --- NAV data mode ---
    if (!schemeCode) {
      return NextResponse.json({ error: 'schemeCode or search query parameter is required.' }, { status: 400 });
    }

    // Fetch both MF NAV and Nifty 50 data in parallel from Groww
    const [mfResult, niftyNavMap] = await Promise.all([
      fetchMFNavData(schemeCode, period),
      fetchNifty50Data(period),
    ]);

    const { name: fundName, navMap: selectedNavMap } = mfResult;

    // Get all unique dates, sorted ascending
    const allDates = new Set<string>([...selectedNavMap.keys(), ...niftyNavMap.keys()]);
    const sortedDates = Array.from(allDates).sort();

    // Normalize to percentage change from first available value (base = 100)
    let selectedBase: number | null = null;
    let niftyBase: number | null = null;

    const chartData = sortedDates.map(date => {
      const selectedNav = selectedNavMap.get(date) ?? null;
      const niftyNav = niftyNavMap.get(date) ?? null;

      if (selectedBase === null && selectedNav !== null) selectedBase = selectedNav;
      if (niftyBase === null && niftyNav !== null) niftyBase = niftyNav;

      return {
        date,
        displayDate: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
        selectedFundNav: selectedNav,
        niftyNav: niftyNav,
        // Normalized values (base 100)
        selectedFundNormalized: selectedNav !== null && selectedBase !== null
          ? parseFloat(((selectedNav / selectedBase) * 100).toFixed(2))
          : null,
        niftyNormalized: niftyNav !== null && niftyBase !== null
          ? parseFloat(((niftyNav / niftyBase) * 100).toFixed(2))
          : null,
      };
    });

    return NextResponse.json({
      selectedFund: {
        name: fundName,
        code: parseInt(schemeCode, 10),
      },
      niftyFund: {
        name: 'NIFTY 50 Index',
        code: 0,
      },
      chartData,
      period,
    });
  } catch (error) {
    console.error('Error in /api/mf-nav-data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
