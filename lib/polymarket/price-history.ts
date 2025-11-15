// Historical price data fetching from Polymarket CLOB API

import axios from "axios";

const CLOB_API_BASE = "https://clob.polymarket.com";

export interface PricePoint {
  t: number; // Unix timestamp
  p: number; // Price (0-1)
}

export interface PriceHistory {
  history: PricePoint[];
}

/**
 * Fetch historical prices for a market token
 */
export async function getPriceHistory(
  tokenId: string,
  interval: "1m" | "1w" | "1d" | "6h" | "1h" | "max" = "1w",
  fidelity?: number
): Promise<PricePoint[]> {
  try {
    const params: any = {
      market: tokenId,
      interval,
    };
    
    if (fidelity) {
      params.fidelity = fidelity;
    }

    console.log(`[getPriceHistory] Calling ${CLOB_API_BASE}/prices-history with params:`, params);

    const response = await axios.get(`${CLOB_API_BASE}/prices-history`, {
      params,
      timeout: 10000,
    });

    console.log(`[getPriceHistory] Response status: ${response.status}, data keys:`, Object.keys(response.data || {}));
    
    const history = response.data.history || [];
    console.log(`[getPriceHistory] Returned ${history.length} price points`);
    
    if (history.length > 0) {
      console.log(`[getPriceHistory] Sample: first=${history[0].p}, last=${history[history.length-1].p}`);
    }

    return history;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`[getPriceHistory] HTTP ${error.response?.status} for token ${tokenId}:`, error.response?.data);
    } else {
      console.error(`[getPriceHistory] Error fetching price history for ${tokenId}:`, error);
    }
    return [];
  }
}

/**
 * Calculate correlation between two price series
 */
export function calculateCorrelation(
  prices1: number[],
  prices2: number[]
): number {
  if (prices1.length !== prices2.length || prices1.length < 10) {
    return 0;
  }

  const n = prices1.length;
  
  // Calculate means
  const mean1 = prices1.reduce((sum, p) => sum + p, 0) / n;
  const mean2 = prices2.reduce((sum, p) => sum + p, 0) / n;

  // Calculate covariance and standard deviations
  let covariance = 0;
  let variance1 = 0;
  let variance2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = prices1[i] - mean1;
    const diff2 = prices2[i] - mean2;
    covariance += diff1 * diff2;
    variance1 += diff1 * diff1;
    variance2 += diff2 * diff2;
  }

  const stdDev1 = Math.sqrt(variance1 / n);
  const stdDev2 = Math.sqrt(variance2 / n);

  if (stdDev1 === 0 || stdDev2 === 0) {
    return 0;
  }

  return covariance / (n * stdDev1 * stdDev2);
}

/**
 * Align two price series by timestamp - accepts close timestamps (within 1 hour)
 */
export function alignPriceSeries(
  history1: PricePoint[],
  history2: PricePoint[]
): { prices1: number[]; prices2: number[]; timestamps: number[] } {
  const prices1: number[] = [];
  const prices2: number[] = [];
  const timestamps: number[] = [];
  
  // Sort both series by timestamp
  const sorted1 = [...history1].sort((a, b) => a.t - b.t);
  const sorted2 = [...history2].sort((a, b) => a.t - b.t);
  
  let i1 = 0;
  let i2 = 0;
  const TOLERANCE = 3600; // 1 hour tolerance
  
  while (i1 < sorted1.length && i2 < sorted2.length) {
    const t1 = sorted1[i1].t;
    const t2 = sorted2[i2].t;
    const diff = Math.abs(t1 - t2);
    
    if (diff <= TOLERANCE) {
      // Close enough timestamps - use both
      prices1.push(sorted1[i1].p);
      prices2.push(sorted2[i2].p);
      timestamps.push(Math.min(t1, t2));
      i1++;
      i2++;
    } else if (t1 < t2) {
      i1++;
    } else {
      i2++;
    }
  }
  
  console.log(`[alignPriceSeries] Aligned ${prices1.length} points from ${history1.length} and ${history2.length}`);

  return { prices1, prices2, timestamps };
}

/**
 * Calculate how much market B moved when market A changed by X%
 */
export function calculateImpactMagnitude(
  pricesA: number[],
  pricesB: number[],
  threshold: number = 0.10 // 10% change threshold
): number {
  const impacts: number[] = [];

  for (let i = 1; i < pricesA.length; i++) {
    const changeA = (pricesA[i] - pricesA[i - 1]) / pricesA[i - 1];
    
    // If A changed significantly
    if (Math.abs(changeA) >= threshold) {
      const changeB = (pricesB[i] - pricesB[i - 1]) / pricesB[i - 1];
      impacts.push(changeB / changeA); // Ratio of B's change to A's change
    }
  }

  if (impacts.length === 0) return 0;

  // Return median impact ratio
  impacts.sort((a, b) => a - b);
  const mid = Math.floor(impacts.length / 2);
  return impacts[mid];
}

