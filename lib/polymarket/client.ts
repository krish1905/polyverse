// Polymarket API Client
// Wrapper for Gamma API to fetch market data

import axios from "axios";
import { PolymarketMarket, PolymarketEvent } from "@/types/polymarket";

const GAMMA_API_BASE = process.env.NEXT_PUBLIC_POLYMARKET_GAMMA_API || "https://gamma-api.polymarket.com";

// In-memory cache for market data (60 second TTL)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 60 seconds

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch trending/featured markets for browsing
 */
export async function getTrendingMarkets(limit: number = 50): Promise<PolymarketMarket[]> {
  const cacheKey = `trending_${limit}`;
  const cached = getCached<PolymarketMarket[]>(cacheKey);
  if (cached) return cached;

  try {
    // Fetch markets for trending
    const response = await axios.get(`${GAMMA_API_BASE}/markets`, {
      params: {
        limit: 200, // Fetch more to filter from
        closed: false,
        active: true,
      }
    });
    
    let marketsData = Array.isArray(response.data) ? response.data : [];
    
    // Filter for ACTUALLY ACTIVE trending markets
    marketsData = marketsData.filter((m: any) => {
      const volume24hr = parseFloat(m.volume24hr || 0);
      const liquidity = parseFloat(m.liquidity || m.liquidityNum || 0);
      
      // Must have decent 24h volume AND liquidity
      if (volume24hr < 5000 || liquidity < 10000) return false;
      
      // Skip resolved/near-certain markets (prices very close to 0 or 1)
      const prices = m.outcomePrices;
      if (typeof prices === 'string') {
        try {
          const parsed = JSON.parse(prices);
          const firstPrice = parseFloat(parsed[0] || 0.5);
          // Skip if probability is < 2% or > 98% (basically resolved)
          if (firstPrice < 0.02 || firstPrice > 0.98) return false;
        } catch (e) {
          // If can't parse, keep it
        }
      }
      
      return true;
    });
    
    // Sort by 24h volume
    marketsData.sort((a: any, b: any) => {
      const volA = parseFloat(b.volume24hr || 0);
      const volB = parseFloat(a.volume24hr || 0);
      return volA - volB;
    });
    
    // Deduplicate by groupItemTitle
    const seenGroups = new Set<string>();
    const uniqueMarkets = marketsData.filter((m: any) => {
      const group = m.groupItemTitle;
      if (!group) return true;
      
      if (seenGroups.has(group)) {
        return false;
      }
      seenGroups.add(group);
      return true;
    });
    
    const markets = uniqueMarkets.slice(0, limit).map(transformMarket);
    setCache(cacheKey, markets);
    
    console.log(`[getTrendingMarkets] Returning ${markets.length} active trending markets (24h vol >$5k, liquidity >$10k, uncertain outcomes)`);
    return markets;
  } catch (error) {
    console.error("Error fetching trending markets:", error);
    throw new Error("Failed to fetch trending markets");
  }
}

/**
 * Fetch all active markets (for simulation analysis)
 */
export async function getMarkets(params?: {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
}): Promise<PolymarketMarket[]> {
  const cacheKey = `markets_${JSON.stringify(params)}`;
  const cached = getCached<PolymarketMarket[]>(cacheKey);
  if (cached) return cached;

  // SERVER-SIDE: Try DB first
  if (typeof window === 'undefined') {
    try {
      console.log('[getMarkets] Fetching from database...');
      const dbResponse = await axios.get(`http://localhost:${process.env.PORT || 3001}/api/markets-db/all`, {
        params: { limit: params?.limit || 50000 },
        timeout: 30000,
      });
      
      if (dbResponse.data && Array.isArray(dbResponse.data)) {
        console.log(`[getMarkets] ✓ Got ${dbResponse.data.length} markets from DB (INSTANT!)`);
        return dbResponse.data;
      }
    } catch (dbErr: any) {
      console.log('[getMarkets] DB fetch failed, falling back to API:', dbErr.message);
    }
  }

  try {
    // Fetch ALL markets using pagination
    let allMarketsData: any[] = [];
    let offset = 0;
    const batchSize = 500; // API max is 500 per request
    const maxMarkets = params?.limit || 100000;
    const maxBatches = 20; // Max 20 batches = 10,000 markets
    let batchCount = 0;
    
    console.log(`[getMarkets] Fetching fresh from Polymarket API (up to ${maxMarkets})...`);
    
    while (allMarketsData.length < maxMarkets && batchCount < maxBatches) {
      batchCount++;
      console.log(`[getMarkets] Batch ${batchCount}: fetching ${batchSize} markets from offset ${offset}...`);
      
      const response = await axios.get(`${GAMMA_API_BASE}/markets`, {
        params: {
          limit: batchSize,
          offset,
          closed: params?.closed !== undefined ? params.closed : false,
          active: params?.active !== undefined ? params.active : true,
        },
        timeout: 30000,
      });
      
      if (!Array.isArray(response.data)) {
        console.log(`[getMarkets] Invalid response at offset ${offset}`);
        break;
      }
      
      const batchLength = response.data.length;
      console.log(`[getMarkets] Received ${batchLength} markets in this batch`);
      
      if (batchLength === 0) {
        console.log(`[getMarkets] No markets returned at offset ${offset} - END REACHED`);
        break;
      }
      
      allMarketsData = allMarketsData.concat(response.data);
      console.log(`[getMarkets] Total fetched so far: ${allMarketsData.length}`);
      
      // Move offset forward
      offset += batchSize; // Always increment by batchSize for next request
      
      // If we got less than requested, try one more batch to confirm we're at the end
      if (batchLength < batchSize) {
        console.log(`[getMarkets] Got ${batchLength}/${batchSize} markets - checking if more exist...`);
        // Continue loop to try next batch
      }
    }
    
    console.log(`[getMarkets] Pagination complete after ${batchCount} batches`);
    
    console.log(`[getMarkets] Fetched ${allMarketsData.length} total markets`);
    
    // Filter for active markets with volume
    const filteredData = allMarketsData.filter((m: any) => {
      const volume = parseFloat(m.volume || m.volumeNum || 0);
      const liquidity = parseFloat(m.liquidity || m.liquidityNum || 0);
      return (volume > 0 || liquidity > 0) && m.closed !== true;
    });
    
    console.log(`[getMarkets] Filtered to ${filteredData.length} active markets with volume`);
    
    const markets = filteredData.map(transformMarket);
    setCache(cacheKey, markets);
    return markets;
  } catch (error) {
    console.error("[getMarkets] Error fetching markets:", error);
    throw new Error("Failed to fetch markets from Polymarket");
  }
}

/**
 * Search markets by keyword - searches ALL Polymarket markets
 */
export async function searchMarkets(query: string): Promise<PolymarketMarket[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  console.log(`[searchMarkets] Searching for: "${query}"`);
  // Server-side search - client handles search directly via DB
  
  // Fallback to Polymarket search
  try {
    console.log(`[searchMarkets] Using Polymarket search as fallback...`);
    const response = await axios.get(`${GAMMA_API_BASE}/search`, {
      params: { q: query },
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      }
    });
    
    let marketsData = Array.isArray(response.data) ? response.data : [];
    console.log(`[searchMarkets] Polymarket returned ${marketsData.length} results`);
    
    marketsData.sort((a: any, b: any) => {
      const volA = parseFloat(a.volume24hr || a.volume || 0);
      const volB = parseFloat(b.volume24hr || b.volume || 0);
      return volB - volA;
    });
    
    const markets = marketsData.map(transformMarket);
    console.log(`[searchMarkets] Returning ${markets.length} from Polymarket`);
    return markets;
  } catch (searchError: any) {
    console.error('[searchMarkets] Polymarket search failed:', searchError.message);
    console.log('[searchMarkets] Returning empty array (client-side cache will handle search)');
    return [];
  }
}

/**
 * OLD PARALLEL FETCH CODE - KEEPING AS BACKUP
 */
async function BACKUP_fetchAllMarketsParallel(query: string): Promise<PolymarketMarket[]> {
  try {
    console.log(`[BACKUP] Fetching markets in PARALLEL (10 batches at once)...`);
    
    const actualBatchSize = 500;
    const maxMarkets = 50000;
    const maxConcurrent = 10; // Fetch 10 batches in parallel
    
    let allMarkets: any[] = [];
    
    // Create batch fetch promises
    const totalBatches = Math.ceil(maxMarkets / actualBatchSize);
    
    for (let batchGroup = 0; batchGroup < totalBatches; batchGroup += maxConcurrent) {
      const batchPromises = [];
      
      for (let i = 0; i < maxConcurrent && (batchGroup + i) < totalBatches; i++) {
        const offset = (batchGroup + i) * actualBatchSize;
        
        const promise = axios.get(`${GAMMA_API_BASE}/markets`, {
          params: {
            limit: actualBatchSize,
            offset: offset,
          },
          timeout: 15000,
        }).catch(err => {
          console.error(`[searchMarkets] Batch ${offset} failed:`, err.message);
          return { data: [] };
        });
        
        batchPromises.push(promise);
      }
      
      // Wait for all batches in this group to complete
      const results = await Promise.all(batchPromises);
      
      // Combine results
      for (const result of results) {
        const batch = Array.isArray(result.data) ? result.data : [];
        if (batch.length > 0) {
          allMarkets = allMarkets.concat(batch);
        }
      }
      
      console.log(`[searchMarkets] Parallel batch complete: ${allMarkets.length} markets total`);
      
      // If any batch returned 0 results, we've hit the end
      const hasEmptyBatch = results.some(r => !r.data || r.data.length === 0);
      if (hasEmptyBatch) {
        console.log(`[searchMarkets] Hit end of markets at ${allMarkets.length} total`);
        break;
      }
    }
    
    console.log(`[searchMarkets] Total markets fetched: ${allMarkets.length} (in parallel)`);
    
    const response = { data: allMarkets };
    
    let marketsData = Array.isArray(response.data) ? response.data : [];
    
    // Client-side filtering for search terms
    const queryLower = query.toLowerCase();
    
    // DEBUG: Check first 5 markets to see their structure
    if (marketsData.length > 0) {
      console.log(`[searchMarkets] Sample market questions:`);
      marketsData.slice(0, 5).forEach((m: any, i: number) => {
        console.log(`  ${i+1}. "${(m.question || '').substring(0, 80)}"`);
      });
    }
    
    marketsData = marketsData.filter((m: any) => {
      const question = (m.question || '').toLowerCase();
      const description = (m.description || '').toLowerCase();
      const category = (m.category || '').toLowerCase();
      const groupTitle = (m.groupItemTitle || '').toLowerCase();
      const outcomes = Array.isArray(m.outcomes) ? m.outcomes.join(' ').toLowerCase() : '';
      
      return question.includes(queryLower) || 
             description.includes(queryLower) || 
             category.includes(queryLower) ||
             groupTitle.includes(queryLower) ||
             outcomes.includes(queryLower);
    });
    
    console.log(`[searchMarkets] After filtering: ${marketsData.length} matches for "${query}"`);
    
    // DEBUG: Show first few matches
    if (marketsData.length > 0) {
      console.log(`[searchMarkets] First ${Math.min(3, marketsData.length)} matches:`);
      marketsData.slice(0, 3).forEach((m: any, i: number) => {
        console.log(`  ${i+1}. "${(m.question || '').substring(0, 80)}"`);
      });
    }
    
    // Don't filter for active/closed - keep everything
    console.log(`[searchMarkets] Before final filtering: ${marketsData.length} matches`);
    
    // Sort by relevance (volume)
    marketsData.sort((a: any, b: any) => {
      const volA = parseFloat(a.volume24hr || a.volume || 0);
      const volB = parseFloat(b.volume24hr || b.volume || 0);
      return volB - volA;
    });
    
    // Return ALL matching results
    const markets = marketsData.map(transformMarket);
    
    console.log(`[searchMarkets] Final: Returning ${markets.length} markets for "${query}"`);
    return markets;
  } catch (error) {
    console.error("[searchMarkets] Error searching markets:", error);
    return [];
  }
}

/**
 * Get specific market details by ID
 */
export async function getMarketDetails(marketId: string): Promise<PolymarketMarket | null> {
  const cacheKey = `market_${marketId}`;
  const cached = getCached<PolymarketMarket>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${GAMMA_API_BASE}/markets/${marketId}`);
    const market = transformMarket(response.data);
    setCache(cacheKey, market);
    return market;
  } catch (error) {
    console.error(`Error fetching market ${marketId}:`, error);
    return null;
  }
}

/**
 * Get events with multiple markets
 */
export async function getEvents(): Promise<PolymarketEvent[]> {
  const cacheKey = "events";
  const cached = getCached<PolymarketEvent[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${GAMMA_API_BASE}/events`);
    const events = response.data.map(transformEvent);
    setCache(cacheKey, events);
    return events;
  } catch (error) {
    console.error("Error fetching events:", error);
    throw new Error("Failed to fetch events");
  }
}

/**
 * Get markets by category
 */
export async function getMarketsByCategory(category: string): Promise<PolymarketMarket[]> {
  const cacheKey = `category_${category}`;
  const cached = getCached<PolymarketMarket[]>(cacheKey);
  if (cached) return cached;

  try {
    // Fetch all markets and filter by category
    // Note: Actual Polymarket API might have a direct category endpoint
    const allMarkets = await getMarkets({ active: true, limit: 500 });
    const filtered = allMarkets.filter(m => 
      m.category?.toLowerCase() === category.toLowerCase() ||
      m.tags?.some(t => t.toLowerCase() === category.toLowerCase())
    );
    setCache(cacheKey, filtered);
    return filtered;
  } catch (error) {
    console.error(`Error fetching markets for category ${category}:`, error);
    throw new Error("Failed to fetch markets by category");
  }
}

/**
 * Transform API response to our Market interface
 * EXPORTED so it can be used client-side
 */
export function transformMarket(apiMarket: any): PolymarketMarket {
  // Parse outcomes and prices - Polymarket returns these as JSON strings!
  let outcomes: string[] = ["YES", "NO"];
  let outcomePrices: number[] = [0.5, 0.5];

  // Parse outcomes (it's a JSON string like "[\"Yes\", \"No\"]")
  if (typeof apiMarket.outcomes === 'string') {
    try {
      outcomes = JSON.parse(apiMarket.outcomes);
    } catch (e) {
      console.error(`[Transform] Failed to parse outcomes for market ${apiMarket.id}`);
    }
  } else if (Array.isArray(apiMarket.outcomes)) {
    outcomes = apiMarket.outcomes;
  }

  // Parse outcomePrices (it's a JSON string like "[\"0.091\", \"0.909\"]")
  if (typeof apiMarket.outcomePrices === 'string') {
    try {
      const parsedPrices = JSON.parse(apiMarket.outcomePrices);
      outcomePrices = parsedPrices.map((p: string | number) => parseFloat(String(p)) || 0);
    } catch (e) {
      console.error(`[Transform] Failed to parse outcomePrices for market ${apiMarket.id}`);
    }
  } else if (Array.isArray(apiMarket.outcomePrices)) {
    outcomePrices = apiMarket.outcomePrices.map((p: any) => parseFloat(p) || 0);
  } else if (apiMarket.lastTradePrice !== undefined && apiMarket.lastTradePrice !== 0) {
    // Use lastTradePrice as fallback
    const price = parseFloat(apiMarket.lastTradePrice);
    outcomePrices = [price, 1 - price];
  } else if (apiMarket.bestBid !== undefined && apiMarket.bestAsk !== undefined) {
    // Use midpoint of bid/ask spread
    const bid = parseFloat(apiMarket.bestBid) || 0;
    const ask = parseFloat(apiMarket.bestAsk) || 1;
    const midPrice = (bid + ask) / 2;
    outcomePrices = [midPrice, 1 - midPrice];
  }

  // Ensure arrays have same length
  while (outcomePrices.length < outcomes.length) {
    outcomePrices.push(0);
  }

  return {
    id: apiMarket.id || apiMarket.condition_id || apiMarket.market_id || String(Math.random()),
    question: apiMarket.question || apiMarket.title || apiMarket.description || "Unknown Market",
    description: apiMarket.description || "",
    outcomes,
    outcomePrices,
    volume: parseFloat(apiMarket.volume || 0),
    liquidity: parseFloat(apiMarket.liquidity || 0),
    endDate: apiMarket.endDate || apiMarket.end_date_iso || apiMarket.end_date,
    active: apiMarket.active !== false,
    closed: apiMarket.closed === true,
    category: apiMarket.category || apiMarket.groupItemTitle || "Other",
    tags: Array.isArray(apiMarket.tags) ? apiMarket.tags : [],
    image: apiMarket.image,
    createdAt: apiMarket.createdAt || apiMarket.created_at,
    clobTokenIds: apiMarket.clobTokenIds, // Keep as string for parsing later
    slug: apiMarket.slug, // Market slug for Polymarket embeds
  };
}

/**
 * Transform API response to our Event interface
 */
function transformEvent(apiEvent: any): PolymarketEvent {
  return {
    id: apiEvent.id,
    title: apiEvent.title,
    description: apiEvent.description,
    markets: (apiEvent.markets || []).map(transformMarket),
    category: apiEvent.category,
    endDate: apiEvent.endDate || apiEvent.end_date_iso,
  };
}

/**
 * Clear cache (useful for forcing refresh)
 */
export function clearCache(): void {
  cache.clear();
}

