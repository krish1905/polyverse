// Core causal simulation engine
// Combines historical correlations + LLM reasoning to build causal graphs

import { PolymarketMarket } from "@/types/polymarket";
import {
  CausalLink,
  SimulationNode,
  SimulationScenario,
  ConfidenceLevel,
  PropagationParams,
} from "@/types/simulation";
import {
  getCorrelation,
  findStrongCorrelations,
} from "@/lib/polymarket/correlations";
import {
  findInterestingCausalMarkets,
  analyzeCausalRelationship,
  generateCausalExplanation,
} from "@/lib/ai/openai";

/**
 * Build a causal graph starting from a trigger market
 */
export async function buildCausalGraph(
  triggerMarket: PolymarketMarket,
  triggerOutcome: string,
  availableMarkets: PolymarketMarket[],
  params: PropagationParams
): Promise<{ nodes: SimulationNode[]; edges: CausalLink[] }> {
  const nodes: SimulationNode[] = [];
  const edges: CausalLink[] = [];
  const processedMarkets = new Set<string>();
  const queue: Array<{ market: PolymarketMarket; layer: number }> = [];

  // Add trigger market as layer 0
  const triggerOutcomeIndex = triggerMarket.outcomes.indexOf(triggerOutcome);
  const triggerNode: SimulationNode = {
    market: triggerMarket,
    currentProbability: triggerMarket.outcomePrices[triggerOutcomeIndex],
    predictedProbability: 1.0, // Trigger assumes outcome occurs
    probabilityChange: 1.0 - triggerMarket.outcomePrices[triggerOutcomeIndex],
    percentChange: 100,
    layer: 0,
    impactLevel: "high",
    incomingLinks: [],
    outgoingLinks: [],
  };
  nodes.push(triggerNode);
  processedMarkets.add(triggerMarket.id);
  queue.push({ market: triggerMarket, layer: 0 });

  // Process markets layer by layer
  while (queue.length > 0 && queue[0].layer < params.maxDepth) {
    const { market: currentMarket, layer: currentLayer } = queue.shift()!;

    // Find related markets using LIVE LLM analysis
    const relatedResults = await findRelatedMarkets(
      currentMarket,
      triggerOutcome,
      availableMarkets,
      params
    );

    for (const result of relatedResults) {
      if (processedMarkets.has(result.market.id)) continue;

      // Build causal link using LLM-provided data
      const causalLink: CausalLink = {
        sourceMarketId: currentMarket.id,
        targetMarketId: result.market.id,
        strength: result.strength,
        direction: result.direction as "increase" | "decrease",
        timelag: result.timelag,
        confidenceLevel: result.strength > 0.7 ? "HIGH" : result.strength > 0.4 ? "MEDIUM" : "LOW",
        explanation: result.reasoning,
        llmGenerated: true,
      };

      // Create node for the affected market
      const affectedNode = createAffectedNode(
        result.market,
        causalLink,
        currentLayer + 1
      );

      nodes.push(affectedNode);
      edges.push(causalLink);
      processedMarkets.add(result.market.id);
      
      // Only continue propagation for high-strength relationships
      if (result.strength > 0.5 && currentLayer + 1 < params.maxDepth) {
        queue.push({ market: result.market, layer: currentLayer + 1 });
      }

      // Update links
      const sourceNode = nodes.find(n => n.market.id === currentMarket.id);
      if (sourceNode) {
        sourceNode.outgoingLinks.push(causalLink);
      }
      affectedNode.incomingLinks.push(causalLink);
    }
  }

  return { nodes, edges };
}

/**
 * Find markets related to the current market using LIVE LLM analysis
 */
async function findRelatedMarkets(
  market: PolymarketMarket,
  outcome: string,
  availableMarkets: PolymarketMarket[],
  params: PropagationParams
): Promise<Array<{ market: PolymarketMarket; reasoning: string; timelag: string; strength: number; direction: string }>> {
  console.log(`[findRelatedMarkets] Finding INTERESTING causal markets for: ${market.question} → ${outcome}`);
  console.log(`[findRelatedMarkets] Analyzing across ${availableMarkets.length} markets`);
  
  // Use LLM to find interesting cross-category relationships
  const llmResults = await findInterestingCausalMarkets(market, outcome, availableMarkets);
  
  // Convert to markets with metadata
  const relatedMarkets = llmResults.map(result => {
    const foundMarket = availableMarkets.find(m => m.id === result.marketId);
    if (!foundMarket) return null;
    
    return {
      market: foundMarket,
      reasoning: result.reasoning,
      timelag: result.timelag,
      strength: result.strength,
      direction: result.impactDirection || 'increase',
    };
  }).filter(r => r !== null) as Array<{ market: PolymarketMarket; reasoning: string; timelag: string; strength: number; direction: string }>;
  
  console.log(`[findRelatedMarkets] LLM found ${relatedMarkets.length} interesting causal relationships`);
  return relatedMarkets;
}

// buildCausalLink is no longer needed - we get all data from LLM directly

/**
 * Create a simulation node for an affected market
 */
function createAffectedNode(
  market: PolymarketMarket,
  incomingLink: CausalLink,
  layer: number
): SimulationNode {
  // Calculate predicted probability change
  // This is a simplified model - in production, use more sophisticated propagation
  const currentProb = market.outcomePrices[0]; // Assume YES outcome
  const changeDirection = incomingLink.direction === "increase" ? 1 : -1;
  const changeMagnitude = incomingLink.strength * 0.3; // Scale down for realism
  
  let predictedProb = currentProb + (changeDirection * changeMagnitude);
  predictedProb = Math.max(0.01, Math.min(0.99, predictedProb)); // Clamp

  const probabilityChange = predictedProb - currentProb;
  const percentChange = (probabilityChange / currentProb) * 100;

  // Determine impact level
  let impactLevel: "high" | "medium" | "low" = "low";
  if (Math.abs(percentChange) > 30) impactLevel = "high";
  else if (Math.abs(percentChange) > 10) impactLevel = "medium";

  return {
    market,
    currentProbability: currentProb,
    predictedProbability: predictedProb,
    probabilityChange,
    percentChange,
    layer,
    impactLevel,
    incomingLinks: [],
    outgoingLinks: [],
  };
}

/**
 * Create a complete simulation scenario
 */
export async function createSimulationScenario(
  name: string,
  description: string,
  triggerMarket: PolymarketMarket,
  triggerOutcome: string,
  availableMarkets: PolymarketMarket[],
  params: PropagationParams
): Promise<SimulationScenario> {
  const { nodes, edges } = await buildCausalGraph(
    triggerMarket,
    triggerOutcome,
    availableMarkets,
    params
  );

  // Calculate metadata
  const totalMarketsAffected = nodes.length - 1; // Exclude trigger
  const avgProbabilityShift =
    nodes.slice(1).reduce((sum, n) => sum + Math.abs(n.probabilityChange), 0) /
    (totalMarketsAffected || 1);
  const maxProbabilityShift = Math.max(
    ...nodes.slice(1).map(n => Math.abs(n.probabilityChange))
  );

  // Calculate overall confidence score
  const confidenceScores = edges.map(e => {
    if (e.confidenceLevel === "HIGH") return 90;
    if (e.confidenceLevel === "MEDIUM") return 70;
    return 50;
  });
  const confidenceScore =
    confidenceScores.reduce((a, b) => a + b, 0) / (confidenceScores.length || 1);

  // Determine time horizon
  const maxLayer = Math.max(...nodes.map(n => n.layer));
  let timeHorizon = "immediate";
  if (maxLayer >= 3) timeHorizon = "weeks";
  else if (maxLayer >= 2) timeHorizon = "days";
  else if (maxLayer >= 1) timeHorizon = "hours";

  const triggerOutcomeIndex = triggerMarket.outcomes.indexOf(triggerOutcome);

  return {
    name,
    description,
    triggerMarket,
    triggerOutcome,
    triggerProbability: 1.0,
    nodes,
    edges,
    metadata: {
      totalMarketsAffected,
      avgProbabilityShift,
      maxProbabilityShift,
      confidenceScore,
      timeHorizon,
    },
  };
}

