// Probability propagation through causal networks

import { SimulationNode, CausalLink } from "@/types/simulation";

/**
 * Propagate probability changes through the network
 * This implements a simplified Bayesian network propagation
 */
export function propagateProbabilities(
  nodes: SimulationNode[],
  edges: CausalLink[]
): SimulationNode[] {
  // Sort nodes by layer for sequential processing
  const sortedNodes = [...nodes].sort((a, b) => a.layer - b.layer);

  // Process each layer
  const maxLayer = Math.max(...sortedNodes.map(n => n.layer));
  
  for (let layer = 1; layer <= maxLayer; layer++) {
    const layerNodes = sortedNodes.filter(n => n.layer === layer);

    for (const node of layerNodes) {
      // Get all incoming links
      const incomingLinks = edges.filter(e => e.targetMarketId === node.market.id);

      if (incomingLinks.length === 0) continue;

      // Calculate probability based on incoming influences
      let totalInfluence = 0;
      let totalWeight = 0;

      for (const link of incomingLinks) {
        // Find source node
        const sourceNode = sortedNodes.find(n => n.market.id === link.sourceMarketId);
        if (!sourceNode) continue;

        // Calculate influence
        const sourceShock = sourceNode.predictedProbability - sourceNode.currentProbability;
        const direction = link.direction === "increase" ? 1 : -1;
        const influence = sourceShock * link.strength * direction;

        // Weight by confidence
        const confidenceWeight = 
          link.confidenceLevel === "HIGH" ? 1.0 :
          link.confidenceLevel === "MEDIUM" ? 0.7 : 0.4;

        totalInfluence += influence * confidenceWeight;
        totalWeight += confidenceWeight;
      }

      // Apply weighted average influence
      if (totalWeight > 0) {
        const avgInfluence = totalInfluence / totalWeight;
        
        // Apply to current probability
        let newProbability = node.currentProbability + avgInfluence;
        
        // Clamp to valid probability range
        newProbability = Math.max(0.01, Math.min(0.99, newProbability));
        
        // Update node
        node.predictedProbability = newProbability;
        node.probabilityChange = newProbability - node.currentProbability;
        node.percentChange = (node.probabilityChange / node.currentProbability) * 100;

        // Update impact level
        const absChange = Math.abs(node.percentChange);
        node.impactLevel = absChange > 30 ? "high" : absChange > 10 ? "medium" : "low";
      }
    }
  }

  return sortedNodes;
}

/**
 * Calculate confidence intervals for probability predictions
 */
export function calculateConfidenceIntervals(
  nodes: SimulationNode[],
  edges: CausalLink[]
): Array<{ node: SimulationNode; lower: number; upper: number }> {
  return nodes.map(node => {
    if (node.layer === 0) {
      // Trigger node has no uncertainty
      return {
        node,
        lower: node.predictedProbability,
        upper: node.predictedProbability,
      };
    }

    // Calculate uncertainty based on:
    // 1. Confidence levels of incoming links
    // 2. Number of propagation layers
    // 3. Strength of correlations

    const incomingLinks = edges.filter(e => e.targetMarketId === node.market.id);
    
    // Base uncertainty increases with layer depth
    const layerUncertainty = node.layer * 0.05;

    // Link confidence affects uncertainty
    const avgConfidence = incomingLinks.reduce((sum, link) => {
      const conf = link.confidenceLevel === "HIGH" ? 0.9 :
                   link.confidenceLevel === "MEDIUM" ? 0.7 : 0.5;
      return sum + conf;
    }, 0) / (incomingLinks.length || 1);

    const confidenceUncertainty = (1 - avgConfidence) * 0.15;

    // Total uncertainty
    const totalUncertainty = layerUncertainty + confidenceUncertainty;

    // Calculate bounds
    const lower = Math.max(0.01, node.predictedProbability - totalUncertainty);
    const upper = Math.min(0.99, node.predictedProbability + totalUncertainty);

    return { node, lower, upper };
  });
}

/**
 * Detect feedback loops in the causal network
 */
export function detectFeedbackLoops(
  nodes: SimulationNode[],
  edges: CausalLink[]
): string[][] {
  const loops: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string, path: string[]): void {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    // Get outgoing edges
    const outgoing = edges.filter(e => e.sourceMarketId === nodeId);

    for (const edge of outgoing) {
      const targetId = edge.targetMarketId;

      if (!visited.has(targetId)) {
        dfs(targetId, [...path]);
      } else if (recursionStack.has(targetId)) {
        // Found a loop
        const loopStart = path.indexOf(targetId);
        if (loopStart !== -1) {
          loops.push(path.slice(loopStart));
        }
      }
    }

    recursionStack.delete(nodeId);
  }

  // Start DFS from each node
  for (const node of nodes) {
    if (!visited.has(node.market.id)) {
      dfs(node.market.id, []);
    }
  }

  return loops;
}

/**
 * Generate multiple scenarios (conservative, expected, aggressive)
 */
export function generateScenarioVariants(
  nodes: SimulationNode[],
  edges: CausalLink[]
): {
  conservative: SimulationNode[];
  expected: SimulationNode[];
  aggressive: SimulationNode[];
} {
  const intervals = calculateConfidenceIntervals(nodes, edges);

  // Conservative: use lower bounds
  const conservative = nodes.map((node, i) => ({
    ...node,
    predictedProbability: node.layer === 0 ? node.predictedProbability : intervals[i].lower,
    probabilityChange: node.layer === 0 ? node.probabilityChange : 
      intervals[i].lower - node.currentProbability,
    percentChange: node.layer === 0 ? node.percentChange :
      ((intervals[i].lower - node.currentProbability) / node.currentProbability) * 100,
  }));

  // Expected: use predicted values (already set)
  const expected = nodes;

  // Aggressive: use upper bounds
  const aggressive = nodes.map((node, i) => ({
    ...node,
    predictedProbability: node.layer === 0 ? node.predictedProbability : intervals[i].upper,
    probabilityChange: node.layer === 0 ? node.probabilityChange :
      intervals[i].upper - node.currentProbability,
    percentChange: node.layer === 0 ? node.percentChange :
      ((intervals[i].upper - node.currentProbability) / node.currentProbability) * 100,
  }));

  return { conservative, expected, aggressive };
}

