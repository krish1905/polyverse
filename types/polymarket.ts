// Polymarket API Types

export interface PolymarketMarket {
  id: string;
  question: string;
  description?: string;
  outcomes: string[];
  outcomePrices: number[]; // Probability for each outcome (0-1)
  volume: number;
  liquidity: number;
  endDate?: string;
  active: boolean;
  closed: boolean;
  category?: string;
  tags?: string[];
  image?: string;
  createdAt?: string;
  clobTokenIds?: string; // JSON string array of token IDs for price history
  slug?: string; // Market slug for embeds
}

export interface PolymarketEvent {
  id: string;
  title: string;
  description?: string;
  markets: PolymarketMarket[];
  category?: string;
  endDate?: string;
}

export interface MarketOutcome {
  marketId: string;
  outcome: string;
  outcomeIndex: number;
  currentPrice: number;
}

export interface HistoricalPrice {
  timestamp: string;
  price: number;
}

export interface MarketPriceHistory {
  marketId: string;
  outcome: string;
  history: HistoricalPrice[];
}

