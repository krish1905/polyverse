// API route to fetch Polymarket markets

import { NextRequest, NextResponse } from "next/server";
import { getMarkets, searchMarkets, getMarketDetails, getTrendingMarkets } from "@/lib/polymarket/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const marketId = searchParams.get("id");
    const trending = searchParams.get("trending") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");

    // Specific market by ID
    if (marketId) {
      const market = await getMarketDetails(marketId);
      if (!market) {
        return NextResponse.json({ error: "Market not found" }, { status: 404 });
      }
      return NextResponse.json(market);
    }

    // Search ALL markets by query
    if (query) {
      const markets = await searchMarkets(query);
      console.log(`[Markets API] Search for "${query}" returned ${markets.length} results`);
      return NextResponse.json(markets);
    }

    // Get trending markets for browsing
    if (trending) {
      const markets = await getTrendingMarkets(limit);
      console.log(`[Markets API] Returning ${markets.length} trending markets`);
      return NextResponse.json(markets);
    }

    // Get all markets (for simulation)
    const markets = await getMarkets({ limit });
    console.log(`[Markets API] Returning ${markets.length} markets`);
    return NextResponse.json(markets);
  } catch (error) {
    console.error("Error in markets API:", error);
    return NextResponse.json(
      { error: "Failed to fetch markets", details: (error as Error).message },
      { status: 500 }
    );
  }
}

