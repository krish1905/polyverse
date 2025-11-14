// Simulation Engine Types

import { PolymarketMarket } from "./polymarket";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface CorrelationData {
  marketId: string;
  correlation: number; // Pearson correlation coefficient (-1 to 1)
  confidence: number; // Statistical significance (0-1)
  lagDays: number; // Time lag between events
  sampleSize: number; // Number of data points used
  direction: "positive" | "negative"; // Direction of correlation
}

export interface CausalLink {
  sourceMarketId: string;
  targetMarketId: string;
  strength: number; // Expected magnitude of influence (0-1)
  direction: "increase" | "decrease"; // Direction of probability change
  timelag: string; // "immediate" | "hours" | "days" | "weeks"
  confidenceLevel: ConfidenceLevel;
  explanation: string; // LLM-generated narrative
  historicalCorrelation?: CorrelationData; // If backed by data
  llmGenerated: boolean; // True if suggested by LLM only
}

export interface SimulationNode {
  market: PolymarketMarket;
  currentProbability: number;
  predictedProbability: number;
  probabilityChange: number; // Absolute change
  percentChange: number; // Percentage change
  layer: number; // Time layer (0 = trigger, 1 = immediate, 2 = next, etc.)
  impactLevel: "high" | "medium" | "low";
  incomingLinks: CausalLink[];
  outgoingLinks: CausalLink[];
}

export interface SimulationScenario {
  name: string;
  description: string;
  triggerMarket: PolymarketMarket;
  triggerOutcome: string;
  triggerProbability: number; // Final probability after trigger (usually 1.0 or 0.0)
  nodes: SimulationNode[];
  edges: CausalLink[];
  metadata: {
    totalMarketsAffected: number;
    avgProbabilityShift: number;
    maxProbabilityShift: number;
    confidenceScore: number; // Overall confidence (0-100)
    timeHorizon: string; // How far into future
  };
}

export interface Simulation {
  id: string;
  name: string;
  createdAt: string;
  status: "pending" | "running" | "complete" | "error";
  triggerMarketId: string;
  triggerMarketQuestion: string;
  triggerOutcome: string;
  scenarios: SimulationScenario[];
  activeScenarioIndex: number;
}

export interface PropagationParams {
  conservativeMode: boolean; // Use lower bounds of confidence intervals
  maxDepth: number; // Maximum propagation layers
  minCorrelation: number; // Minimum correlation to consider
  includeLLMOnly: boolean; // Include LLM-only suggestions
}

