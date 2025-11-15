// API route to run a causal simulation

import { NextRequest, NextResponse } from "next/server";
import { getMarkets, getMarketDetails } from "@/lib/polymarket/client";
import { createSimulationScenario } from "@/lib/simulation/causal-engine-simple";
import { PropagationParams } from "@/types/simulation";

export async function POST(request: NextRequest) {
  console.log("\n=== SIMULATION RUN STARTED ===");
  try {
    const body = await request.json();
    const {
      marketId,
      outcome,
      scenarioName,
      scenarioDescription,
      params,
    } = body;

    console.log(`[Simulation API] Request - marketId: ${marketId}, outcome: ${outcome}`);

    // Validate inputs
    if (!marketId || !outcome) {
      return NextResponse.json(
        { error: "Missing required fields: marketId, outcome" },
        { status: 400 }
      );
    }

    // Get trigger market
    console.log(`[Simulation API] Fetching trigger market...`);
    const triggerMarket = await getMarketDetails(marketId);
    if (!triggerMarket) {
      return NextResponse.json(
        { error: "Trigger market not found" },
        { status: 404 }
      );
    }
    console.log(`[Simulation API] Trigger market: ${triggerMarket.question}`);
    console.log(`[Simulation API] Outcomes: ${triggerMarket.outcomes.join(", ")}`);

    // Verify outcome exists
    if (!triggerMarket.outcomes.includes(outcome)) {
      console.log(`[Simulation API] ERROR: Outcome "${outcome}" not in ${JSON.stringify(triggerMarket.outcomes)}`);
      return NextResponse.json(
        { error: "Invalid outcome for this market" },
        { status: 400 }
      );
    }

    // Get ALL available markets for propagation analysis with pagination
    console.log(`[Simulation API] Fetching ALL available markets from Polymarket...`);
    const availableMarkets = await getMarkets({ limit: 100000, active: true });
    console.log(`[Simulation API] Got ${availableMarkets.length} markets for live analysis`);
    
    if (availableMarkets.length < 100) {
      console.error(`[Simulation API] ERROR: Too few markets fetched! Only got ${availableMarkets.length}`);
      return NextResponse.json(
        { error: `Only fetched ${availableMarkets.length} markets - expected thousands` },
        { status: 500 }
      );
    }
    
    console.log(`[Simulation API] Market categories represented:`, 
      [...new Set(availableMarkets.map(m => m.category))].slice(0, 20).join(', ')
    );

    // Set default propagation parameters
    const propagationParams: PropagationParams = {
      conservativeMode: params?.conservativeMode ?? false,
      maxDepth: params?.maxDepth ?? 3,
      minCorrelation: params?.minCorrelation ?? 0.3,
      includeLLMOnly: params?.includeLLMOnly ?? true,
    };
    console.log(`[Simulation API] Propagation params:`, propagationParams);

    // Create simulation scenario
    console.log(`[Simulation API] Creating simulation scenario...`);
    const scenario = await createSimulationScenario(
      scenarioName || `${triggerMarket.question} → ${outcome}`,
      scenarioDescription || `Simulation of ${outcome} occurring`,
      triggerMarket,
      outcome,
      availableMarkets,
      propagationParams
    );

    console.log(`[Simulation API] Scenario created:`, {
      nodes: scenario.nodes.length,
      edges: scenario.edges.length,
      marketsAffected: scenario.metadata.totalMarketsAffected,
    });
    console.log("=== SIMULATION RUN COMPLETE ===\n");

    return NextResponse.json({
      success: true,
      scenario,
    });
  } catch (error) {
    console.error("[Simulation API] Error running simulation:", error);
    return NextResponse.json(
      { error: "Failed to run simulation", details: (error as Error).message },
      { status: 500 }
    );
  }
}

