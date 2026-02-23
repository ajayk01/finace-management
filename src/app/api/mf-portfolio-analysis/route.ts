import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// --- Types ---

interface UploadedTransaction {
  fundName: string;
  type: string; // PURCHASE, REDEMPTION, etc.
  units: number;
  nav: number;
  amount: number;
  date: string; // YYYY-MM-DD
}

interface GrowwSearchResult {
  scheme_code: string;
  title: string;
  search_id: string;
}

interface GrowwSearchResponse {
  content: GrowwSearchResult[];
}

interface GrowwMFNavResponse {
  folio: {
    name: string;
    data: [number, number][];
  };
}

interface GrowwNiftyResponse {
  candles: [number, number][];
}

// --- Groww scheme code search (best match) ---
async function resolveSchemeCode(fundName: string): Promise<{ schemeCode: number; schemeName: string } | null> {
  try {
    // Search using fund name keywords
    const searchQuery = fundName
      .replace(/Direct|Growth|Plan|Regular/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const res = await fetch(
      `https://groww.in/v1/api/search/v1/entity?app=false&entity_type=scheme&page=0&q=${encodeURIComponent(searchQuery)}&size=5`
    );
    if (!res.ok) return null;

    const data: GrowwSearchResponse = await res.json();
    const results = data.content || [];
    if (results.length === 0) return null;

    // Try to find an exact match or closest "Direct Growth" match
    const normalizedFundName = fundName.toLowerCase().replace(/\s+/g, ' ').trim();
    const directGrowthMatch = results.find(r =>
      r.title.toLowerCase().includes('direct') &&
      r.title.toLowerCase().includes('growth')
    );

    const best = directGrowthMatch || results[0];
    return {
      schemeCode: parseInt(best.scheme_code, 10),
      schemeName: best.title,
    };
  } catch {
    return null;
  }
}

// --- Fetch MF NAV data from Groww ---
async function fetchMFNavData(schemeCode: number, startDate: Date, endDate: Date): Promise<{ name: string; navMap: Map<string, number> }> {
  // Calculate months between start and end
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMonths = Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30)) + 2; // add buffer
  const months = Math.max(diffMonths, 12);

  const url = `https://groww.in/v1/api/data/mf/web/v1/scheme/${schemeCode}/graph?benchmark=false&months=${months}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch NAV for scheme ${schemeCode}`);

  const data: GrowwMFNavResponse = await res.json();
  const folio = data?.folio;
  if (!folio) throw new Error(`No folio data for scheme ${schemeCode}`);

  const navMap = new Map<string, number>();
  for (const [timestampMs, nav] of folio.data) {
    if (nav === null || nav === undefined) continue;
    const date = new Date(timestampMs);
    const key = date.toISOString().split('T')[0];
    navMap.set(key, parseFloat(nav.toFixed(4)));
  }

  return { name: folio.name, navMap };
}

// --- Fetch Nifty 50 data ---
async function fetchNifty50Data(startDate: Date, endDate: Date): Promise<Map<string, number>> {
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365);

  let range = '1y';
  if (diffYears > 5) range = '10y';
  else if (diffYears > 3) range = '5y';
  else if (diffYears > 1) range = '3y';

  const interval = diffYears > 3 ? 3 : 1;

  const url = `https://groww.in/v1/api/charting_service/v2/chart/exchange/NSE/segment/CASH/NIFTY/${range}?intervalInDays=${interval}&minimal=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Groww Nifty API returned ${res.status}`);

  const data: GrowwNiftyResponse = await res.json();
  const candles = data?.candles || [];

  const navMap = new Map<string, number>();
  for (const [timestampSec, close] of candles) {
    if (close === null || close === undefined) continue;
    const date = new Date(timestampSec * 1000);
    if (date < startDate) continue;
    const key = date.toISOString().split('T')[0];
    navMap.set(key, parseFloat(close.toFixed(2)));
  }

  return navMap;
}

/**
 * POST /api/mf-portfolio-analysis
 *
 * Accepts parsed XLSX transaction data, resolves fund scheme codes,
 * fetches NAV history for each fund + Nifty 50, and returns chart data.
 *
 * Body: { transactions: UploadedTransaction[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const transactions: UploadedTransaction[] = body.transactions || [];

    if (transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions provided' }, { status: 400 });
    }

    // Group transactions by fund name
    const fundMap = new Map<string, UploadedTransaction[]>();
    for (const tx of transactions) {
      const existing = fundMap.get(tx.fundName) || [];
      existing.push(tx);
      fundMap.set(tx.fundName, existing);
    }

    // Find date range
    const allDatesRaw = transactions.map(tx => new Date(tx.date));
    const minDate = new Date(Math.min(...allDatesRaw.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDatesRaw.map(d => d.getTime())));

    // Add buffer: start 7 days before first investment
    const startDate = new Date(minDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(); // today

    // Resolve scheme codes for each fund
    const fundNames = Array.from(fundMap.keys());
    const schemeResolutions = await Promise.all(
      fundNames.map(name => resolveSchemeCode(name))
    );

    // Fetch NAV data for resolved funds + Nifty
    const fundFetches: Promise<{ fundName: string; schemeName: string; schemeCode: number; navMap: Map<string, number> } | null>[] = [];

    for (let i = 0; i < fundNames.length; i++) {
      const resolution = schemeResolutions[i];
      if (!resolution) {
        console.warn(`Could not resolve scheme code for: ${fundNames[i]}`);
        continue;
      }

      const fundName = fundNames[i];
      const { schemeCode, schemeName } = resolution;

      fundFetches.push(
        fetchMFNavData(schemeCode, startDate, endDate)
          .then(result => ({
            fundName,
            schemeName: result.name || schemeName,
            schemeCode,
            navMap: result.navMap,
          }))
          .catch(err => {
            console.warn(`Failed to fetch NAV for ${fundName}:`, err);
            return null;
          })
      );
    }

    const [niftyNavMap, ...fundResults] = await Promise.all([
      fetchNifty50Data(startDate, endDate),
      ...fundFetches,
    ]);

    const resolvedFunds = fundResults.filter((f): f is NonNullable<typeof f> => f !== null);

    if (resolvedFunds.length === 0) {
      return NextResponse.json({ error: 'Could not resolve any fund scheme codes' }, { status: 400 });
    }

    // Collect all unique dates
    const allDatesSet = new Set<string>();
    for (const fund of resolvedFunds) {
      for (const date of fund.navMap.keys()) allDatesSet.add(date);
    }
    for (const date of niftyNavMap.keys()) allDatesSet.add(date);

    // Filter to only dates within our range
    const startStr = startDate.toISOString().split('T')[0];
    const sortedDates = Array.from(allDatesSet)
      .filter(d => d >= startStr)
      .sort();

    // Build normalized chart data (base 100 for each line from first available value)
    const bases: Record<string, number | null> = {};
    for (const fund of resolvedFunds) {
      bases[fund.fundName] = null;
    }
    bases['nifty50'] = null;

    const chartData = sortedDates.map(date => {
      const point: Record<string, any> = {
        date,
        displayDate: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
      };

      // Nifty 50
      const niftyVal = niftyNavMap.get(date) ?? null;
      if (bases['nifty50'] === null && niftyVal !== null) bases['nifty50'] = niftyVal;
      point['nifty50'] = niftyVal !== null && bases['nifty50'] !== null
        ? parseFloat(((niftyVal / bases['nifty50']!) * 100).toFixed(2))
        : null;
      point['nifty50Raw'] = niftyVal;

      // Each fund
      for (const fund of resolvedFunds) {
        const navVal = fund.navMap.get(date) ?? null;
        if (bases[fund.fundName] === null && navVal !== null) bases[fund.fundName] = navVal;
        point[fund.fundName] = navVal !== null && bases[fund.fundName] !== null
          ? parseFloat(((navVal / bases[fund.fundName]!) * 100).toFixed(2))
          : null;
        point[`${fund.fundName}_raw`] = navVal;
      }

      return point;
    });

    // Build investment markers (dates when SIPs happened per fund)
    const investments: { fundName: string; date: string; amount: number; units: number; nav: number; type: string }[] = [];
    for (const [fundName, txs] of fundMap.entries()) {
      for (const tx of txs) {
        investments.push({
          fundName,
          date: tx.date,
          amount: tx.amount,
          units: tx.units,
          nav: tx.nav,
          type: tx.type,
        });
      }
    }

    // Fund info for legend
    const funds = resolvedFunds.map(f => ({
      fundName: f.fundName,
      schemeName: f.schemeName,
      schemeCode: f.schemeCode,
    }));

    // Fund-wise summary
    const fundSummary = fundNames.map(name => {
      const txs = fundMap.get(name) || [];
      const totalUnits = txs.reduce((sum, tx) => sum + (tx.type === 'PURCHASE' ? tx.units : -tx.units), 0);
      const totalInvested = txs.reduce((sum, tx) => sum + (tx.type === 'PURCHASE' ? tx.amount : 0), 0);
      const totalRedeemed = txs.reduce((sum, tx) => sum + (tx.type !== 'PURCHASE' ? tx.amount : 0), 0);

      return {
        fundName: name,
        totalTransactions: txs.length,
        totalUnits: parseFloat(totalUnits.toFixed(4)),
        totalInvested,
        totalRedeemed,
        netInvested: totalInvested - totalRedeemed,
      };
    });

    return NextResponse.json({
      funds,
      chartData,
      investments,
      fundSummary,
      dateRange: {
        start: startStr,
        end: endDate.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    console.error('Error in /api/mf-portfolio-analysis:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
