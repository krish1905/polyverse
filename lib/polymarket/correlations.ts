// Historical correlation analysis for Polymarket markets
// This module calculates pairwise correlations between markets

import { CorrelationData } from "@/types/simulation";

// Storage for correlation data (in production, this would be in a database)
let correlationDatabase: Map<string, Map<string, CorrelationData>> = new Map();

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Calculate time-lagged correlation to find optimal lag
 */
function calculateLaggedCorrelation(
  x: number[],
  y: number[],
  maxLag: number = 7
): { correlation: number; lag: number } {
  let bestCorrelation = 0;
  let bestLag = 0;

  for (let lag = 0; lag <= Math.min(maxLag, x.length - 2); lag++) {
    if (lag >= x.length || lag >= y.length) break;

    const xLagged = x.slice(0, -lag || undefined);
    const yLagged = y.slice(lag);
    const minLength = Math.min(xLagged.length, yLagged.length);

    if (minLength < 3) continue;

    const correlation = pearsonCorrelation(
      xLagged.slice(0, minLength),
      yLagged.slice(0, minLength)
    );

    if (Math.abs(correlation) > Math.abs(bestCorrelation)) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  return { correlation: bestCorrelation, lag: bestLag };
}

/**
 * Calculate statistical significance (p-value approximation)
 */
function calculateConfidence(correlation: number, sampleSize: number): number {
  // Fisher z-transformation for confidence
  const z = 0.5 * Math.log((1 + Math.abs(correlation)) / (1 - Math.abs(correlation)));
  const se = 1 / Math.sqrt(sampleSize - 3);
  const zScore = z / se;

  // Approximate p-value from z-score
  // This is a simplification; in production, use a proper statistical library
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
  return 1 - pValue;
}

/**
 * Normal cumulative distribution function (approximation)
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * Analyze correlation between two markets given their historical price data
 */
export function analyzeCorrelation(
  marketAId: string,
  marketBId: string,
  pricesA: number[],
  pricesB: number[]
): CorrelationData | null {
  if (pricesA.length < 10 || pricesB.length < 10) {
    return null; // Not enough data
  }

  // Align the arrays (use minimum length)
  const minLength = Math.min(pricesA.length, pricesB.length);
  const alignedA = pricesA.slice(0, minLength);
  const alignedB = pricesB.slice(0, minLength);

  // Calculate correlation with optimal lag
  const { correlation, lag } = calculateLaggedCorrelation(alignedA, alignedB);

  // Check if correlation is significant
  if (Math.abs(correlation) < 0.3) {
    return null; // Too weak to be meaningful
  }

  const confidence = calculateConfidence(correlation, minLength);

  // Require p < 0.05 (confidence > 0.95) for statistical significance
  if (confidence < 0.95) {
    return null;
  }

  return {
    marketId: marketBId,
    correlation,
    confidence,
    lagDays: lag,
    sampleSize: minLength,
    direction: correlation > 0 ? "positive" : "negative",
  };
}

/**
 * Get correlation data for a market pair
 */
export function getCorrelation(marketAId: string, marketBId: string): CorrelationData | null {
  const marketACorrelations = correlationDatabase.get(marketAId);
  if (!marketACorrelations) return null;
  return marketACorrelations.get(marketBId) || null;
}

/**
 * Get all correlations for a given market
 */
export function getMarketCorrelations(marketId: string): CorrelationData[] {
  const correlations = correlationDatabase.get(marketId);
  if (!correlations) return [];
  return Array.from(correlations.values());
}

/**
 * Store correlation data
 */
export function storeCorrelation(
  marketAId: string,
  marketBId: string,
  data: CorrelationData
): void {
  if (!correlationDatabase.has(marketAId)) {
    correlationDatabase.set(marketAId, new Map());
  }
  correlationDatabase.get(marketAId)!.set(marketBId, data);
}

/**
 * Load correlation data from JSON (for pre-computed correlations)
 */
export function loadCorrelationData(data: Record<string, Record<string, CorrelationData>>): void {
  correlationDatabase.clear();
  
  for (const [marketAId, correlations] of Object.entries(data)) {
    const marketMap = new Map<string, CorrelationData>();
    for (const [marketBId, corrData] of Object.entries(correlations)) {
      marketMap.set(marketBId, corrData);
    }
    correlationDatabase.set(marketAId, marketMap);
  }
}

/**
 * Export correlation database to JSON
 */
export function exportCorrelationData(): Record<string, Record<string, CorrelationData>> {
  const result: Record<string, Record<string, CorrelationData>> = {};
  
  for (const [marketAId, correlations] of correlationDatabase.entries()) {
    result[marketAId] = {};
    for (const [marketBId, data] of correlations.entries()) {
      result[marketAId][marketBId] = data;
    }
  }
  
  return result;
}

/**
 * Find strongly correlated markets
 */
export function findStrongCorrelations(
  marketId: string,
  minCorrelation: number = 0.5
): CorrelationData[] {
  const correlations = getMarketCorrelations(marketId);
  return correlations
    .filter(c => Math.abs(c.correlation) >= minCorrelation)
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

/**
 * Initialize with empty database
 */
export function initializeCorrelationDatabase(): void {
  correlationDatabase = new Map();
}

