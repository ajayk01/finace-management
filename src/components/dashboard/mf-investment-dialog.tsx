"use client";

import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Search, TrendingUp, X, Upload, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import * as XLSX from "xlsx";

// ==================== TYPES ====================

interface SearchResult {
  schemeCode: number;
  schemeName: string;
}

interface ChartDataPoint {
  date: string;
  displayDate: string;
  selectedFundNav: number | null;
  niftyNav: number | null;
  selectedFundNormalized: number | null;
  niftyNormalized: number | null;
}

interface FundInfo {
  name: string;
  code: number;
  category?: string;
  fundHouse?: string;
}

interface MFInvestmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Portfolio upload types
interface ParsedTransaction {
  fundName: string;
  type: string;
  units: number;
  nav: number;
  amount: number;
  date: string; // YYYY-MM-DD
}

interface PortfolioFund {
  fundName: string;
  schemeName: string;
  schemeCode: number;
}

interface FundSummary {
  fundName: string;
  totalTransactions: number;
  totalUnits: number;
  totalInvested: number;
  totalRedeemed: number;
  netInvested: number;
}

interface InvestmentMarker {
  fundName: string;
  date: string;
  amount: number;
  units: number;
  nav: number;
  type: string;
}

// ==================== CONSTANTS ====================

const PERIOD_OPTIONS = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "3y", label: "3Y" },
  { value: "5y", label: "5Y" },
  { value: "all", label: "ALL" },
];

const FUND_COLORS = [
  "hsl(142, 76%, 36%)",   // Green
  "hsl(221, 83%, 53%)",   // Blue
  "hsl(280, 67%, 50%)",   // Purple
  "hsl(24, 95%, 53%)",    // Orange
  "hsl(340, 75%, 55%)",   // Pink
  "hsl(173, 80%, 36%)",   // Teal
];

const NIFTY_COLOR = "hsl(0, 72%, 51%)"; // Red

const lineColors = {
  selectedFund: "hsl(var(--chart-1))", // Green
  nifty: "hsl(var(--chart-2))", // Red/Orange
};

// ==================== HELPERS ====================

/** Parse date strings like "19 Feb 2026" to "2026-02-19" */
function parseExcelDate(dateStr: string): string {
  if (!dateStr) return "";
  const str = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };

  const match = str.match(/(\d{1,2})\s*[-/]?\s*([A-Za-z]{3})\s*[-/]?\s*(\d{4})/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = months[match[2].toLowerCase()] || "01";
    return `${match[3]}-${month}-${day}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  return str;
}

/** Parse Groww XLSX structure to transactions */
function parseGrowwXLSX(workbook: XLSX.WorkBook): ParsedTransaction[] {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    const row = rawData[i];
    if (Array.isArray(row) && row.some((cell: any) => String(cell).toLowerCase().includes("scheme name"))) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error("Could not find header row with 'Scheme Name' in the XLSX file");
  }

  const headers = (rawData[headerRowIdx] as any[]).map((h: any) => String(h || "").toLowerCase().trim());

  const nameIdx = headers.findIndex(h => h.includes("scheme name") || h.includes("fund name"));
  const typeIdx = headers.findIndex(h => h.includes("transaction type") || h.includes("type"));
  const unitsIdx = headers.findIndex(h => h.includes("unit"));
  const navIdx = headers.findIndex(h => h.includes("nav"));
  const amountIdx = headers.findIndex(h => h.includes("amount"));
  const dateIdx = headers.findIndex(h => h.includes("date"));

  if (nameIdx === -1 || amountIdx === -1 || dateIdx === -1) {
    throw new Error("XLSX must have columns: Scheme Name, Amount, Date");
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i] as any[];
    if (!row || !row[nameIdx]) continue;

    const fundName = String(row[nameIdx]).trim();
    if (!fundName || fundName.toLowerCase() === "scheme name") continue;

    const type = typeIdx >= 0 ? String(row[typeIdx] || "PURCHASE").trim().toUpperCase() : "PURCHASE";
    const units = unitsIdx >= 0 ? parseFloat(String(row[unitsIdx] || "0").replace(/,/g, "")) : 0;
    const nav = navIdx >= 0 ? parseFloat(String(row[navIdx] || "0").replace(/,/g, "")) : 0;
    const amount = parseFloat(String(row[amountIdx] || "0").replace(/,/g, ""));
    const date = parseExcelDate(String(row[dateIdx] || ""));

    if (isNaN(amount) || !date) continue;

    transactions.push({ fundName, type, units, nav, amount, date });
  }

  return transactions;
}

// ==================== TOOLTIPS ====================

const SingleFundTooltip = ({
  active,
  payload,
  label,
}: ComponentProps<typeof Tooltip>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card p-3 border rounded-md shadow-lg min-w-[220px]">
        <p className="label font-semibold text-sm text-foreground mb-2">
          {label}
        </p>
        {payload.map((entry: any, index: number) => {
          if (entry.value === null || entry.value === undefined) return null;
          const isNifty = entry.dataKey === "niftyNav";
          const formatted = isNifty
            ? entry.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })
            : entry.value.toFixed(4);
          return (
            <p
              key={`item-${index}`}
              style={{ color: entry.color }}
              className="text-xs mb-0.5"
            >
              {`${entry.name}: ${isNifty ? "" : "₹"}${formatted}`}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

const PortfolioTooltip = ({
  active,
  payload,
  label,
  investments,
}: ComponentProps<typeof Tooltip> & { investments?: InvestmentMarker[] }) => {
  if (active && payload && payload.length) {
    const dateInvestments = investments?.filter(inv => inv.date === label) || [];

    return (
      <div className="bg-card p-3 border rounded-md shadow-lg min-w-[250px] max-w-[350px]">
        <p className="font-semibold text-sm text-foreground mb-2">
          {label ? new Date(label).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}
        </p>
        {payload.map((entry: any, index: number) => {
          if (entry.value === null || entry.value === undefined) return null;
          const isNifty = entry.dataKey === "nifty50Raw";
          const isFundRaw = entry.dataKey?.endsWith("_raw");
          const formatted = isNifty
            ? entry.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })
            : isFundRaw
            ? `₹${entry.value.toFixed(4)}`
            : entry.value.toFixed(2);
          return (
            <p
              key={`item-${index}`}
              style={{ color: entry.color }}
              className="text-xs mb-0.5"
            >
              {`${entry.name}: ${isNifty ? "" : ""}${formatted}`}
            </p>
          );
        })}
        {dateInvestments.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-xs font-semibold mb-1">SIP on this date:</p>
            {dateInvestments.map((inv, idx) => (
              <p key={idx} className="text-xs text-muted-foreground">
                ₹{inv.amount.toLocaleString("en-IN")} ({inv.units} units @ ₹{inv.nav})
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
};

// ==================== MAIN COMPONENT ====================

export function MFInvestmentDialog({
  open,
  onOpenChange,
}: MFInvestmentDialogProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState("search");

  // === Search tab state ===
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFund, setSelectedFund] = useState<SearchResult | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [fundInfo, setFundInfo] = useState<FundInfo | null>(null);
  const [niftyInfo, setNiftyInfo] = useState<FundInfo | null>(null);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [period, setPeriod] = useState("1y");
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Search tab visibility
  const [visibility, setVisibility] = useState({
    selectedFundNav: true,
    niftyNav: true,
  });

  type VisibilityKey = keyof typeof visibility;

  const isVisibilityKey = (value: unknown): value is VisibilityKey =>
    value === "selectedFundNav" || value === "niftyNav";

  const handleLegendClick: NonNullable<
    ComponentProps<typeof Legend>["onClick"]
  > = (payload) => {
    const dataKey = (payload as any)?.dataKey;
    if (!isVisibilityKey(dataKey)) return;
    setVisibility((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey],
    }));
  };

  const renderLegendText = (value: string, entry: any) => {
    const dataKey = entry?.dataKey ?? entry?.payload?.dataKey;
    const isActive = isVisibilityKey(dataKey) ? visibility[dataKey] : true;
    return (
      <span
        className={cn(
          "transition-colors text-xs",
          isActive ? "text-foreground" : "text-muted-foreground line-through"
        )}
      >
        {value}
      </span>
    );
  };

  // === Portfolio upload tab state ===
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [portfolioChartData, setPortfolioChartData] = useState<any[]>([]);
  const [portfolioFunds, setPortfolioFunds] = useState<PortfolioFund[]>([]);
  const [portfolioInvestments, setPortfolioInvestments] = useState<InvestmentMarker[]>([]);
  const [fundSummaryData, setFundSummaryData] = useState<FundSummary[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [showInvestmentMarkers, setShowInvestmentMarkers] = useState(true);
  const [portfolioVisibility, setPortfolioVisibility] = useState<Record<string, boolean>>({});
  const [selectedPortfolioFund, setSelectedPortfolioFund] = useState<string | null>(null);
  const [portfolioPeriod, setPortfolioPeriod] = useState("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/mf-nav-data?search=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.results || []);
      setShowResults(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSearch(value), 400);
  };

  // Fetch chart data for single fund search
  const fetchChartData = useCallback(
    async (schemeCode: number, selectedPeriod: string) => {
      setIsLoadingChart(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/mf-nav-data?schemeCode=${schemeCode}&period=${selectedPeriod}`
        );
        if (!res.ok) throw new Error("Failed to fetch NAV data");
        const data = await res.json();

        setChartData(data.chartData || []);
        setFundInfo(data.selectedFund || null);
        setNiftyInfo(data.niftyFund || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        setChartData([]);
      } finally {
        setIsLoadingChart(false);
      }
    },
    []
  );

  const handleSelectFund = (fund: SearchResult) => {
    setSelectedFund(fund);
    setShowResults(false);
    setSearchQuery(fund.schemeName);
    fetchChartData(fund.schemeCode, period);
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (selectedFund) {
      fetchChartData(selectedFund.schemeCode, newPeriod);
    }
  };

  const handleClearSelection = () => {
    setSelectedFund(null);
    setChartData([]);
    setFundInfo(null);
    setNiftyInfo(null);
    setSearchQuery("");
    setError(null);
  };

  // === Portfolio upload handlers ===
  const analyzePortfolio = useCallback(async (transactions: ParsedTransaction[]) => {
    setIsAnalyzing(true);
    setPortfolioError(null);

    try {
      const res = await fetch("/api/mf-portfolio-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to analyze portfolio");
      }

      const data = await res.json();

      setPortfolioChartData(data.chartData || []);
      setPortfolioFunds(data.funds || []);
      setPortfolioInvestments(data.investments || []);
      setFundSummaryData(data.fundSummary || []);

      // Auto-select first fund
      if (data.funds && data.funds.length > 0) {
        setSelectedPortfolioFund(data.funds[0].fundName);
      }

      const vis: Record<string, boolean> = { nifty50: true };
      for (const fund of data.funds || []) {
        vis[fund.fundName] = true;
      }
      setPortfolioVisibility(vis);
    } catch (err) {
      setPortfolioError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setPortfolioError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const transactions = parseGrowwXLSX(workbook);

      if (transactions.length === 0) {
        throw new Error("No valid transactions found in the XLSX file");
      }

      setParsedTransactions(transactions);
      await analyzePortfolio(transactions);
    } catch (err) {
      setPortfolioError(err instanceof Error ? err.message : "Failed to parse XLSX file");
      setParsedTransactions([]);
    }
  }, [analyzePortfolio]);

  const handleClearUpload = useCallback(() => {
    setUploadedFile(null);
    setParsedTransactions([]);
    setPortfolioChartData([]);
    setPortfolioFunds([]);
    setPortfolioInvestments([]);
    setFundSummaryData([]);
    setPortfolioError(null);
    setPortfolioVisibility({});
    setSelectedPortfolioFund(null);
    setPortfolioPeriod("all");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset on dialog close
  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedFund(null);
      setChartData([]);
      setFundInfo(null);
      setNiftyInfo(null);
      setError(null);
      setPeriod("1y");
      setShowResults(false);
      setVisibility({ selectedFundNav: true, niftyNav: true });
      setActiveTab("search");
      handleClearUpload();
    }
    onOpenChange(isOpen);
  };

  // Sample chart data for x-axis labels
  const sampledData = React.useMemo(() => {
    if (chartData.length <= 15) return chartData;
    const step = Math.ceil(chartData.length / 15);
    return chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1);
  }, [chartData]);

  const tickDates = React.useMemo(() => {
    return sampledData.map((d) => d.date);
  }, [sampledData]);


  // Build a Set of "fundName::date" for O(1) lookup of SIP dates per fund
  const investmentDateSetByFund = React.useMemo(() => {
    const set = new Set<string>();
    for (const inv of portfolioInvestments) {
      set.add(`${inv.fundName}::${inv.date}`);
    }
    return set;
  }, [portfolioInvestments]);

  // Filter portfolio chart data by selected period
  const filteredPortfolioChartData = React.useMemo(() => {
    if (portfolioPeriod === "all" || portfolioChartData.length === 0) {
      return portfolioChartData;
    }
    const now = new Date();
    const cutoff = new Date(now);
    const periodMap: Record<string, number> = {
      "1m": 1, "3m": 3, "6m": 6, "1y": 12, "3y": 36, "5y": 60,
    };
    const months = periodMap[portfolioPeriod] || 0;
    if (months === 0) return portfolioChartData;
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return portfolioChartData.filter((d: any) => d.date >= cutoffStr);
  }, [portfolioChartData, portfolioPeriod]);

  // Filtered tick dates for portfolio chart
  const filteredPortfolioTickDates = React.useMemo(() => {
    if (filteredPortfolioChartData.length <= 15) return filteredPortfolioChartData.map((d: any) => d.date);
    const step = Math.ceil(filteredPortfolioChartData.length / 15);
    return filteredPortfolioChartData
      .filter((_: any, i: number) => i % step === 0 || i === filteredPortfolioChartData.length - 1)
      .map((d: any) => d.date);
  }, [filteredPortfolioChartData]);

  // Investment markers filtered for selected fund
  const selectedFundInvestments = React.useMemo(() => {
    if (!selectedPortfolioFund) return portfolioInvestments;
    return portfolioInvestments.filter(inv => inv.fundName === selectedPortfolioFund);
  }, [portfolioInvestments, selectedPortfolioFund]);

  // Get selected fund's color
  const selectedFundColor = React.useMemo(() => {
    if (!selectedPortfolioFund) return FUND_COLORS[0];
    const idx = portfolioFunds.findIndex(f => f.fundName === selectedPortfolioFund);
    return FUND_COLORS[idx >= 0 ? idx % FUND_COLORS.length : 0];
  }, [selectedPortfolioFund, portfolioFunds]);

  // Get selected fund's display name
  const selectedFundDisplayName = React.useMemo(() => {
    if (!selectedPortfolioFund) return "";
    const fund = portfolioFunds.find(f => f.fundName === selectedPortfolioFund);
    if (!fund) return selectedPortfolioFund;
    return fund.schemeName.length > 50
      ? fund.schemeName.slice(0, 47) + "..."
      : fund.schemeName;
  }, [selectedPortfolioFund, portfolioFunds]);

  // Custom dot renderer: shows a bold dot only on dates the fund had an investment
  const makeInvestmentDotRenderer = useCallback(
    (fundName: string, color: string) => {
      return (props: any): React.ReactElement<SVGElement> => {
        const { cx, cy, payload, index } = props;
        if (!cx || !cy || !payload?.date || !showInvestmentMarkers) {
          return <circle key={`empty-${fundName}-${index}`} r={0} />;
        }
        const key = `${fundName}::${payload.date}`;
        if (!investmentDateSetByFund.has(key)) {
          return <circle key={`empty-${fundName}-${index}`} r={0} />;
        }
        return (
          <circle
            key={`dot-${fundName}-${payload.date}`}
            cx={cx}
            cy={cy}
            r={5}
            fill={color}
            stroke="white"
            strokeWidth={2}
          />
        );
      };
    },
    [investmentDateSetByFund, showInvestmentMarkers]
  );

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      setUploadedFile(file);
      setPortfolioError(null);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const transactions = parseGrowwXLSX(workbook);
        if (transactions.length === 0) throw new Error("No valid transactions found");
        setParsedTransactions(transactions);
        await analyzePortfolio(transactions);
      } catch (err) {
        setPortfolioError(err instanceof Error ? err.message : "Failed to parse file");
      }
    } else {
      setPortfolioError("Please upload an .xlsx or .xls file");
    }
  }, [analyzePortfolio]);

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Check MF Investment
          </DialogTitle>
          <DialogDescription>
            Search a fund or upload your Groww portfolio XLSX to compare performance vs Nifty 50
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search Fund
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Portfolio
            </TabsTrigger>
          </TabsList>

          {/* ==================== SEARCH TAB ==================== */}
          <TabsContent value="search" className="space-y-4 mt-4">
            {/* Search Section */}
            <div className="relative" ref={resultsRef}>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search mutual fund (e.g., Axis Bluechip, HDFC Mid Cap)..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {searchQuery && (
                    <button
                      onClick={handleClearSelection}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {isSearching && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>

              {showResults && searchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-card border rounded-md shadow-lg">
                  {searchResults.map((result) => (
                    <button
                      key={result.schemeCode}
                      onClick={() => handleSelectFund(result)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors border-b last:border-b-0 flex items-center justify-between"
                    >
                      <span className="truncate mr-2">{result.schemeName}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {result.schemeCode}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fund Info */}
            {fundInfo && (
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="outline" className="text-xs">
                  {fundInfo.fundHouse}
                </Badge>
                {fundInfo.category && (
                  <Badge variant="secondary" className="text-xs">
                    {fundInfo.category}
                  </Badge>
                )}
              </div>
            )}

            {/* Period Selector */}
            {selectedFund && (
              <div className="flex gap-1 flex-wrap">
                {PERIOD_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={period === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePeriodChange(opt.value)}
                    className="h-7 px-3 text-xs"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-sm text-destructive text-center py-4">
                {error}
              </div>
            )}

            {/* Chart */}
            {isLoadingChart ? (
              <div className="flex items-center justify-center h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length > 0 ? (
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      ticks={tickDates}
                      tickFormatter={(value) => {
                        const d = new Date(value);
                        return d.toLocaleDateString("en-IN", {
                          month: "short",
                          year: "2-digit",
                        });
                      }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    {/* Left Y-axis: MF NAV */}
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      tickFormatter={(value) => `₹${value}`}
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      allowDecimals={true}
                      width={60}
                      domain={["auto", "auto"]}
                      stroke={lineColors.selectedFund}
                    />
                    {/* Right Y-axis: Nifty 50 Index */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(value) =>
                        value >= 1000
                          ? `${(value / 1000).toFixed(1)}k`
                          : `${value}`
                      }
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      allowDecimals={false}
                      width={55}
                      domain={["auto", "auto"]}
                      stroke={lineColors.nifty}
                    />
                    <Tooltip
                      content={<SingleFundTooltip />}
                      cursor={{
                        stroke: "hsl(var(--muted))",
                        strokeWidth: 2,
                        strokeDasharray: "3 3",
                      }}
                      labelFormatter={(value) => {
                        const d = new Date(value);
                        return d.toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        });
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={10}
                      wrapperStyle={{ paddingTop: "15px", cursor: "pointer" }}
                      onClick={handleLegendClick}
                      formatter={renderLegendText}
                    />
                    <Line
                      yAxisId="left"
                      hide={!visibility.selectedFundNav}
                      type="monotone"
                      dataKey="selectedFundNav"
                      name={fundInfo?.name || "Selected Fund"}
                      stroke={lineColors.selectedFund}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                    <Line
                      yAxisId="right"
                      hide={!visibility.niftyNav}
                      type="monotone"
                      dataKey="niftyNav"
                      name={niftyInfo?.name || "Nifty 50 Index"}
                      stroke={lineColors.nifty}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : !selectedFund && !error ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <TrendingUp className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm">
                  Search and select a mutual fund to view its performance
                </p>
                <p className="text-xs mt-1">
                  MF NAV (left axis) vs Nifty 50 Index (right axis)
                </p>
              </div>
            ) : null}
          </TabsContent>

          {/* ==================== UPLOAD TAB ==================== */}
          <TabsContent value="upload" className="space-y-4 mt-4">
            {/* File Upload Area */}
            {!uploadedFile ? (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium mb-1">
                  Upload your Groww MF Order History
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Drag &amp; drop an .xlsx file or click to browse
                </p>
                <Button variant="outline" size="sm" type="button">
                  <Upload className="h-4 w-4 mr-2" />
                  Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">{uploadedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedTransactions.length} transactions parsed
                      {portfolioFunds.length > 0 && ` · ${portfolioFunds.length} funds resolved`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClearUpload}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Portfolio Error */}
            {portfolioError && (
              <div className="text-sm text-destructive text-center py-2 bg-destructive/10 rounded-md px-3">
                {portfolioError}
              </div>
            )}

            {/* Loading */}
            {isAnalyzing && (
              <div className="flex flex-col items-center justify-center h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Resolving funds &amp; fetching NAV data...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This may take a few seconds
                </p>
              </div>
            )}

            {/* Fund Summary Cards */}
            {!isAnalyzing && fundSummaryData.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {fundSummaryData.map((fund, idx) => (
                  <div key={fund.fundName} className="border rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: FUND_COLORS[idx % FUND_COLORS.length] }}
                      />
                      <p className="font-medium text-xs truncate">{fund.fundName}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
                      <span>Invested:</span>
                      <span className="text-right font-medium text-foreground">
                        ₹{fund.totalInvested.toLocaleString("en-IN")}
                      </span>
                      <span>Units:</span>
                      <span className="text-right">{fund.totalUnits.toFixed(2)}</span>
                      <span>Txns:</span>
                      <span className="text-right">{fund.totalTransactions}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Fund Selector */}
            {!isAnalyzing && portfolioFunds.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Select Fund</p>
                <div className="flex gap-1.5 flex-wrap">
                  {portfolioFunds.map((fund, idx) => {
                    const color = FUND_COLORS[idx % FUND_COLORS.length];
                    const isSelected = selectedPortfolioFund === fund.fundName;
                    return (
                      <Button
                        key={fund.fundName}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-3 text-xs gap-1.5"
                        style={isSelected ? { backgroundColor: color, borderColor: color } : {}}
                        onClick={() => setSelectedPortfolioFund(fund.fundName)}
                      >
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: isSelected ? "white" : color }}
                        />
                        {fund.schemeName.length > 25
                          ? fund.schemeName.slice(0, 22) + "..."
                          : fund.schemeName}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Period Selector + SIP Toggle */}
            {!isAnalyzing && portfolioChartData.length > 0 && selectedPortfolioFund && (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-1 flex-wrap">
                  {PERIOD_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={portfolioPeriod === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPortfolioPeriod(opt.value)}
                      className="h-7 px-3 text-xs"
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showInvestmentMarkers ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowInvestmentMarkers(!showInvestmentMarkers)}
                  >
                    {showInvestmentMarkers ? "Hide" : "Show"} SIP Dates
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {selectedFundInvestments.length} investments
                  </span>
                </div>
              </div>
            )}

            {/* Portfolio Chart — Dual Y-Axis: Selected Fund NAV vs Nifty 50 */}
            {!isAnalyzing && filteredPortfolioChartData.length > 0 && selectedPortfolioFund && (
              <div className="h-[450px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={filteredPortfolioChartData}
                    margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      ticks={filteredPortfolioTickDates}
                      tickFormatter={(value) => {
                        const d = new Date(value);
                        return d.toLocaleDateString("en-IN", {
                          month: "short",
                          year: "2-digit",
                        });
                      }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    {/* Left Y-axis: Fund NAV */}
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      tickFormatter={(value) => `₹${value}`}
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      allowDecimals={true}
                      width={65}
                      domain={["auto", "auto"]}
                      stroke={selectedFundColor}
                    />
                    {/* Right Y-axis: Nifty 50 Index */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(value) =>
                        value >= 1000
                          ? `${(value / 1000).toFixed(1)}k`
                          : `${value}`
                      }
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      allowDecimals={false}
                      width={55}
                      domain={["auto", "auto"]}
                      stroke={NIFTY_COLOR}
                    />
                    <Tooltip
                      content={
                        <PortfolioTooltip investments={selectedFundInvestments} />
                      }
                      cursor={{
                        stroke: "hsl(var(--muted))",
                        strokeWidth: 2,
                        strokeDasharray: "3 3",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={10}
                      wrapperStyle={{ paddingTop: "15px" }}
                    />

                    {/* Selected Fund NAV line */}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey={`${selectedPortfolioFund}_raw`}
                      name={selectedFundDisplayName}
                      stroke={selectedFundColor}
                      strokeWidth={2}
                      dot={makeInvestmentDotRenderer(selectedPortfolioFund, selectedFundColor)}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />

                    {/* Nifty 50 line */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="nifty50Raw"
                      name="Nifty 50 Index"
                      stroke={NIFTY_COLOR}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Empty state */}
            {!isAnalyzing && !uploadedFile && !portfolioError && (
              <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                <p className="text-xs mt-1">
                  Download your MF Order History from Groww and upload the XLSX file
                </p>
                <p className="text-xs mt-1 opacity-60">
                  The file should have columns: Scheme Name, Transaction Type, Units, NAV, Amount, Date
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
