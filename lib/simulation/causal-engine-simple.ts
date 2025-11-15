// Causal engine with REAL historical data
// Uses LLM to suggest relationships, then validates with actual price correlations

import { PolymarketMarket } from "@/types/polymarket";
import {
  CausalLink,
  SimulationNode,
  SimulationScenario,
  PropagationParams,
} from "@/types/simulation";
import { findInterestingCausalMarkets } from "@/lib/ai/openai";
import {
  getPriceHistory,
  calculateCorrelation,
  alignPriceSeries,
  calculateImpactMagnitude,
} from "@/lib/polymarket/price-history";

/**
 * Extract CLOB token ID from market for price history lookup
 */
function extractTokenId(market: PolymarketMarket): string | null {
  // Markets have clobTokenIds field which is a JSON string array
  const rawTokenIds = (market as any).clobTokenIds;
  console.log(`[extractTokenId] Raw clobTokenIds for ${market.id}:`, rawTokenIds);
  
  if (!rawTokenIds || rawTokenIds === 'null' || rawTokenIds === '[]') {
    console.log(`[extractTokenId] No token IDs for market ${market.id}`);
    return null;
  }
  
  try {
    const tokenIds = JSON.parse(rawTokenIds);
    console.log(`[extractTokenId] Parsed token IDs:`, tokenIds);
    
    if (Array.isArray(tokenIds) && tokenIds.length > 0) {
      console.log(`[extractTokenId] Returning first token ID: ${tokenIds[0]}`);
      return tokenIds[0]; // Return first outcome's token ID
    }
  } catch (e) {
    console.error(`[extractTokenId] Failed to parse clobTokenIds for market ${market.id}:`, e);
  }
  
  console.log(`[extractTokenId] No valid token ID found`);
  return null;
}

/**
 * Create a complete simulation in ONE pass
 */
export async function createSimulationScenario(
  name: string,
  description: string,
  triggerMarket: PolymarketMarket,
  triggerOutcome: string,
  availableMarkets: PolymarketMarket[],
  params: PropagationParams
): Promise<SimulationScenario> {
  console.log(`\n=== CREATING MULTI-LAYER SIMULATION ===`);
  console.log(`Trigger: ${triggerMarket.question} → ${triggerOutcome}`);
  console.log(`Analyzing ${availableMarkets.length} available markets`);
  console.log(`Max depth: ${params.maxDepth} layers`);
  
  const nodes: SimulationNode[] = [];
  const edges: CausalLink[] = [];
  const processedMarkets = new Set<string>();
  
  // Add trigger node (layer 0)
  const triggerOutcomeIndex = triggerMarket.outcomes.indexOf(triggerOutcome);
  const triggerNode: SimulationNode = {
    market: triggerMarket,
    currentProbability: triggerMarket.outcomePrices[triggerOutcomeIndex] || 0.5,
    predictedProbability: 1.0,
    probabilityChange: 1.0 - (triggerMarket.outcomePrices[triggerOutcomeIndex] || 0.5),
    percentChange: 100,
    layer: 0,
    impactLevel: "high",
    incomingLinks: [],
    outgoingLinks: [],
  };
  nodes.push(triggerNode);
  processedMarkets.add(triggerMarket.id);
  
  // Step 1: Get trigger market's price history
  console.log(`Fetching price history for trigger market...`);
  console.log(`Trigger market clobTokenIds: ${(triggerMarket as any).clobTokenIds}`);
  
  const triggerTokenId = extractTokenId(triggerMarket);
  console.log(`Extracted token ID: ${triggerTokenId}`);
  
  const triggerPriceHistory = triggerTokenId ? 
    await getPriceHistory(triggerTokenId, "1w", 60) : []; // 1 week, hourly
  
  console.log(`Got ${triggerPriceHistory.length} price points for trigger market`);
  
  if (triggerPriceHistory.length > 0) {
    console.log(`First price: ${triggerPriceHistory[0].p} at ${new Date(triggerPriceHistory[0].t * 1000).toISOString()}`);
    console.log(`Last price: ${triggerPriceHistory[triggerPriceHistory.length - 1].p} at ${new Date(triggerPriceHistory[triggerPriceHistory.length - 1].t * 1000).toISOString()}`);
  }

  // MULTI-LAYER PROPAGATION
  // Process markets layer by layer
  const marketsToProcess = [{ market: triggerMarket, layer: 0 }];
  const MAX_DEPTH = 3; // STRICT: Max 3 layers deep
  
  // Dynamic limits: Layer 1 = 3, Layer 2 = 2, Layer 3 = 1
  const getMaxNodesForLayer = (layer: number): number => {
    if (layer === 1) return 3;
    if (layer === 2) return 2;
    if (layer === 3) return 1;
    return 0;
  };
  
  while (marketsToProcess.length > 0 && marketsToProcess[0].layer < MAX_DEPTH) {
    const { market: currentMarket, layer: currentLayer } = marketsToProcess.shift()!;
    
    console.log(`\n--- LAYER ${currentLayer + 1} ---`);
    console.log(`Finding markets affected by: ${currentMarket.question.substring(0, 60)}`);
    
    // Find markets affected by current market
    const causalResults = await findInterestingCausalMarkets(
      currentMarket,
      triggerOutcome,
      availableMarkets.filter(m => !processedMarkets.has(m.id))
    );
    
    console.log(`LLM returned ${causalResults.length} relationships for layer ${currentLayer + 1}`);
    
    // Validate with historical data
    console.log(`Validating relationships with price history...`);
    
    interface ValidatedResult {
      marketId: string;
      reasoning: string;
      timelag: string;
      strength: number;
      impactDirection: string;
      correlation?: number;
      impactMagnitude?: number;
      hasHistoricalData: boolean;
    }
    
    const validatedResults: ValidatedResult[] = [];
    
    for (const result of causalResults) {
      const market = availableMarkets.find(m => m.id === result.marketId);
      if (!market || processedMarkets.has(market.id)) continue;
    
    // Get this market's price history
    console.log(`[Validation ${validatedResults.length + 1}/${causalResults.length}] ${market.question.substring(0, 60)}`);
    
    const marketTokenId = extractTokenId(market);
    console.log(`  Token ID: ${marketTokenId || 'NONE'}`);
    
    if (!marketTokenId || triggerPriceHistory.length < 10) {
      console.log(`  SKIP: No token ID or insufficient trigger history`);
      validatedResults.push({
        ...result,
        strength: result.strength * 0.5,
        hasHistoricalData: false,
      });
      continue;
    }
    
    console.log(`  Fetching price history...`);
    const marketPriceHistory = await getPriceHistory(marketTokenId, "1w", 60);
    console.log(`  Got ${marketPriceHistory.length} price points`);
    
    if (marketPriceHistory.length < 10) {
      console.log(`  SKIP: Insufficient price history`);
      validatedResults.push({
        ...result,
        strength: result.strength * 0.5,
        hasHistoricalData: false,
      });
      continue;
    }
    
    // Calculate REAL correlation
    const { prices1, prices2 } = alignPriceSeries(triggerPriceHistory, marketPriceHistory);
    
    if (prices1.length < 10) {
      validatedResults.push({
        ...result,
        strength: result.strength * 0.5,
        hasHistoricalData: false,
      });
      continue;
    }
    
    const correlation = calculateCorrelation(prices1, prices2);
    const impactMagnitude = calculateImpactMagnitude(prices1, prices2, 0.05);
    
    console.log(`  ${market.question.substring(0, 50)}: correlation=${correlation.toFixed(3)}, impact=${impactMagnitude.toFixed(3)}`);
    
    // Filtering: require decent correlation strength (ignore direction) AND good LLM confidence
    const hasStrongCorrelation = Math.abs(correlation) >= 0.20;
    const hasHighConfidence = result.strength >= 0.5;
    
    // Accept if both pass - don't check direction match
    // (LLM reasoning about causation is different from price correlation direction)
    if (hasStrongCorrelation && hasHighConfidence) {
      validatedResults.push({
        ...result,
        correlation,
        impactMagnitude,
        hasHistoricalData: true,
        // Use average of correlation strength and LLM strength
        strength: (Math.abs(correlation) + result.strength) / 2,
      });
      console.log(`    ✓ ACCEPTED: |correlation|=${Math.abs(correlation).toFixed(3)}, LLM strength=${result.strength.toFixed(2)}`);
    } else {
      const reason = !hasStrongCorrelation ? 'weak correlation' : 'low LLM confidence';
      console.log(`    ✗ REJECTED: ${reason} (|corr|=${Math.abs(correlation).toFixed(3)}, strength=${result.strength.toFixed(2)})`);
    }
  }
  
    console.log(`Validated ${validatedResults.length} relationships for layer ${currentLayer + 1}`);
    
    // Build nodes and edges from VALIDATED results - limit per layer dynamically
    const maxForThisLayer = getMaxNodesForLayer(currentLayer + 1);
    const sortedResults = validatedResults
      .filter(r => r.hasHistoricalData) // ONLY use data-backed relationships
      .sort((a, b) => (b.correlation || b.strength) - (a.correlation || a.strength))
      .slice(0, maxForThisLayer); // Dynamic limit based on layer
    
    console.log(`Adding top ${sortedResults.length} DATA-BACKED markets to layer ${currentLayer + 1} (max: ${maxForThisLayer})`);
    
    for (const result of sortedResults) {
      const market = availableMarkets.find(m => m.id === result.marketId);
      if (!market || processedMarkets.has(market.id)) continue;
      
      processedMarkets.add(market.id);
      
      // Determine layer based on current depth
      const layer = currentLayer + 1;
    
    // Calculate probability impact using REAL data if available
    const currentProb = market.outcomePrices[0] || 0.5;
    let changeMagnitude = 0;
    let confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    let direction = 1; // Will be set based on LLM validation
    
    if (result.hasHistoricalData && result.correlation) {
      // Use REAL correlation data
      const correlation = result.correlation;
      
      // Calculate expected probability change based on historical relationship
      const triggerShock = 1.0 - (triggerMarket.outcomePrices[triggerMarket.outcomes.indexOf(triggerOutcome)] || 0.5);
      const correlationDirection = correlation > 0 ? 1 : -1;
      changeMagnitude = Math.abs(correlation) * triggerShock * 0.5;
      
      // Confidence based on correlation strength
      if (Math.abs(correlation) > 0.6) confidenceLevel = "HIGH";
      else if (Math.abs(correlation) > 0.3) confidenceLevel = "MEDIUM";
      else confidenceLevel = "LOW";
      
      // Use LLM reasoning for direction (it understands the semantics)
      // Correlation just tells us magnitude
      direction = result.impactDirection === 'increase' ? 1 : -1;
      
      console.log(`  ${market.question.substring(0, 50)}: correlation ${correlation.toFixed(3)}, LLM says=${result.impactDirection}, magnitude ${changeMagnitude.toFixed(3)}`);
    } else {
      // No historical data - use LLM direction
      changeMagnitude = result.strength * 0.10;
      confidenceLevel = "LOW";
      direction = result.impactDirection === 'increase' ? 1 : -1;
      console.log(`  ${market.question.substring(0, 50)}: NO historical data, LLM says ${result.impactDirection}`);
    }
    
    let predictedProb = currentProb + (direction * changeMagnitude);
    predictedProb = Math.max(0.01, Math.min(0.99, predictedProb));
    
    const probabilityChange = predictedProb - currentProb;
    const percentChange = (probabilityChange / currentProb) * 100;
    
    console.log(`    ${(currentProb * 100).toFixed(1)}% → ${(predictedProb * 100).toFixed(1)}% (${direction > 0 ? '+' : ''}${(probabilityChange * 100).toFixed(1)}%)`);
    
    // Determine impact level
    const absChange = Math.abs(percentChange);
    const impactLevel = absChange > 30 ? "high" : absChange > 10 ? "medium" : "low";
    
    // Create node
    const node: SimulationNode = {
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
    nodes.push(node);
    
      // Create edge with historical data if available
      // Use correlation direction if we have historical data
      const edgeDirection: "increase" | "decrease" = result.hasHistoricalData && result.correlation
        ? (result.correlation > 0 ? "increase" : "decrease")
        : (result.impactDirection as "increase" | "decrease");
      
      const edge: CausalLink = {
        sourceMarketId: currentMarket.id,
        targetMarketId: market.id,
        strength: result.strength,
        direction: edgeDirection,
        timelag: result.timelag,
        confidenceLevel,
        explanation: result.hasHistoricalData && result.correlation
          ? `${result.reasoning} Historical correlation: ${(result.correlation * 100).toFixed(1)}% (${result.correlation > 0 ? 'positive' : 'negative/inverse'})`
          : `${result.reasoning} (Estimated impact)`,
        llmGenerated: !result.hasHistoricalData,
        historicalCorrelation: result.hasHistoricalData && result.correlation ? {
          marketId: market.id,
          correlation: result.correlation,
          confidence: Math.abs(result.correlation),
          lagDays: 0,
          sampleSize: triggerPriceHistory.length,
          direction: result.correlation > 0 ? "positive" : "negative",
        } : undefined,
      };
      edges.push(edge);
      
      // Update link references
      node.incomingLinks.push(edge);
      const sourceNode = nodes.find(n => n.market.id === currentMarket.id);
      if (sourceNode) {
        sourceNode.outgoingLinks.push(edge);
      }
      
      // Add to queue for next layer if strong enough
      if (result.strength > 0.5 && currentLayer + 1 < params.maxDepth) {
        marketsToProcess.push({ market, layer: currentLayer + 1 });
      }
    }
  }
  
  // Calculate metadata
  const totalMarketsAffected = nodes.length - 1;
  const avgProbabilityShift =
    nodes.slice(1).reduce((sum, n) => sum + Math.abs(n.probabilityChange), 0) /
    (totalMarketsAffected || 1);
  const maxProbabilityShift = Math.max(
    ...nodes.slice(1).map(n => Math.abs(n.probabilityChange)),
    0
  );
  
  const confidenceScores = edges.map(e => {
    if (e.confidenceLevel === "HIGH") return 90;
    if (e.confidenceLevel === "MEDIUM") return 70;
    return 50;
  });
  const confidenceScore =
    confidenceScores.reduce((a, b) => a + b, 0) / (confidenceScores.length || 1);
  
  const maxLayer = Math.max(...nodes.map(n => n.layer));
  let timeHorizon = "immediate";
  if (maxLayer >= 3) timeHorizon = "weeks";
  else if (maxLayer >= 2) timeHorizon = "days";
  else if (maxLayer >= 1) timeHorizon = "hours";
  
  console.log(`=== SIMULATION COMPLETE ===`);
  console.log(`Nodes: ${nodes.length}, Edges: ${edges.length}`);
  console.log(`Markets affected: ${totalMarketsAffected}`);
  console.log(`Avg shift: ${(avgProbabilityShift * 100).toFixed(1)}%`);
  console.log(`===========================\n`);
  
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

