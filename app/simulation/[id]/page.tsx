"use client";

import React, { useState, useEffect } from "react";
import { use } from "react";
import { Simulation, SimulationScenario } from "@/types/simulation";
import { PolymarketMarket } from "@/types/polymarket";
import MarketSearch from "@/components/market-search";
import CausalGraph from "@/components/causal-graph";
import AnalyticsPanel from "@/components/analytics-panel";
import Image from "next/image";

export default function SimulationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PolymarketMarket[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [trendingMarkets, setTrendingMarkets] = useState<PolymarketMarket[]>([]);
  const [showTrending, setShowTrending] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string>("");

  // Load trending markets
  useEffect(() => {
    const loadTrending = async () => {
      try {
        const response = await fetch('/api/polymarket/markets?trending=true&limit=10');
        if (response.ok) {
          const markets = await response.json();
          setTrendingMarkets(markets);
        }
      } catch (error) {
        console.error('Failed to load trending:', error);
      }
    };
    loadTrending();
  }, []);

  // Debounce search
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 3) {
      setSearchResults([]);
      setShowResults(false);
      setShowTrending(true); // Show trending when search is empty
      return;
    }

    setShowTrending(false); // Hide trending when searching
    const timeoutId = setTimeout(() => {
      handleSearch(searchQuery);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    // Load simulation from localStorage
    const stored = localStorage.getItem("polyverse_simulations");
    if (stored) {
      try {
        const simulations: Simulation[] = JSON.parse(stored);
        const sim = simulations.find((s) => s.id === id);
        if (sim) {
          setSimulation(sim);
        } else {
          // Create new simulation
          const newSim: Simulation = {
            id,
            name: "New Simulation",
            createdAt: new Date().toISOString(),
            status: "pending",
            triggerMarketId: "",
            triggerMarketQuestion: "",
            triggerOutcome: "",
            scenarios: [],
            activeScenarioIndex: 0,
          };
          setSimulation(newSim);
        }
      } catch (error) {
        console.error("Failed to load simulation:", error);
      }
    } else {
      // Create new simulation
      const newSim: Simulation = {
        id,
        name: "New Simulation",
        createdAt: new Date().toISOString(),
        status: "pending",
        triggerMarketId: "",
        triggerMarketQuestion: "",
        triggerOutcome: "",
        scenarios: [],
        activeScenarioIndex: 0,
      };
      setSimulation(newSim);
    }
  }, [id]);

  const saveSimulation = (updatedSim: Simulation) => {
    setSimulation(updatedSim);
    
    // Save to localStorage
    const stored = localStorage.getItem("polyverse_simulations");
    let simulations: Simulation[] = [];
    if (stored) {
      try {
        simulations = JSON.parse(stored);
      } catch (error) {
        console.error("Failed to parse stored simulations:", error);
      }
    }
    
    const existingIndex = simulations.findIndex((s) => s.id === id);
    if (existingIndex >= 0) {
      simulations[existingIndex] = updatedSim;
    } else {
      simulations.push(updatedSim);
    }
    
    localStorage.setItem("polyverse_simulations", JSON.stringify(simulations));
  };

  const handleRunSimulation = async (
    market: PolymarketMarket,
    outcome: string
  ) => {
    if (!simulation) return;

    // Update simulation status
    const updatedSim = {
      ...simulation,
      status: "running" as const,
      triggerMarketId: market.id,
      triggerMarketQuestion: market.question,
      triggerOutcome: outcome,
      name: `${market.question.substring(0, 50)}... → ${outcome}`,
    };
    saveSimulation(updatedSim);

    try {
      // Call API to run simulation
      const response = await fetch("/api/simulation/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketId: market.id,
          outcome,
          scenarioName: `${market.question} → ${outcome}`,
          scenarioDescription: `Causal simulation of ${outcome} occurring`,
          params: {
            conservativeMode: false,
            maxDepth: 3,
            minCorrelation: 0.3,
            includeLLMOnly: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to run simulation");
      }

      const data = await response.json();
      const scenario: SimulationScenario = data.scenario;

      // Update simulation with results
      const completedSim = {
        ...updatedSim,
        status: "complete" as const,
        scenarios: [scenario],
        activeScenarioIndex: 0,
      };
      saveSimulation(completedSim);
    } catch (error) {
      console.error("Error running simulation:", error);
      const errorSim = {
        ...updatedSim,
        status: "error" as const,
      };
      saveSimulation(errorSim);
    }
  };

  if (!simulation) {
    return (
      <div className="h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Loading simulation...</div>
        </div>
      </div>
    );
  }

  const activeScenario =
    simulation.scenarios[simulation.activeScenarioIndex] || null;

  const handleSearch = async (query: string) => {
    if (!query || query.trim().length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      // Search from DB
      console.log(`[Frontend Search] Searching DB for "${query}"`);
      const response = await fetch(`/api/markets-db/search?q=${encodeURIComponent(query)}`);
      
      if (response.ok) {
        const markets = await response.json();
        console.log(`[Frontend Search] ✓ Got ${markets.length} results from DB`);
        setSearchResults(markets.slice(0, 20));
        setShowResults(true);
      } else {
        console.error('[Frontend Search] DB search failed');
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#1d2b3a] text-white font-mono">
      {/* Left Sidebar - Analytics (hidden on mobile) */}
      <div className="hidden md:flex md:h-full">
        <AnalyticsPanel
          simulation={simulation}
          scenario={activeScenario}
          selectedNode={selectedNode}
        />
      </div>

      {/* Right Side - Graph Area */}
      <div className="flex-1 flex flex-col h-full md:h-auto">
        {/* Graph with Overlay Search */}
        <div className="flex-1 relative">
          {/* Causal Graph */}
          <CausalGraph
            scenario={activeScenario}
            onNodeSelect={setSelectedNode}
            selectedNode={selectedNode}
            isLoading={simulation.status === "running"}
          />

          {/* Click outside to close overlays */}
          {(showTrending || showResults || selectedMarket) && (
            <div 
              className="absolute inset-0 z-40"
              onClick={() => {
                setShowTrending(false);
                setShowResults(false);
                setSelectedMarket(null);
              }}
            />
          )}

          {/* Bottom Search Bar - OVERLAY */}
          <div className="absolute bottom-4 sm:bottom-6 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[600px] z-50">
            {/* Outcome Selection Card - ABOVE trending/search */}
            {selectedMarket && (
              <div className="mb-2 bg-[#304254]/95 backdrop-blur border border-[#3d4f61] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">Select Outcome</h3>
                  <button
                    onClick={() => setSelectedMarket(null)}
                    className="text-white/60 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="text-xs text-white/80 mb-3 line-clamp-2">{selectedMarket.question}</div>
                
                <div className="space-y-2 mb-3">
                  {selectedMarket.outcomes.map((outcome, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedOutcome(outcome)}
                      className={`w-full text-left px-3 py-2 rounded border transition-all ${
                        selectedOutcome === outcome
                          ? 'border-[#56afe2] bg-[#56afe2]/10'
                          : 'border-[#3d4f61] hover:border-[#56afe2]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white">{outcome}</span>
                        <span className="text-xs text-white/60">
                          {(selectedMarket.outcomePrices[idx] * 100).toFixed(1)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => {
                    if (selectedMarket && selectedOutcome) {
                      handleRunSimulation(selectedMarket, selectedOutcome);
                      setSelectedMarket(null);
                      setSearchQuery("");
                      setShowTrending(false);
                      setShowResults(false);
                    }
                  }}
                  className="w-full px-4 py-2 bg-[#56afe2] rounded text-white hover:bg-[#56afe2]/90 transition-colors font-medium text-sm"
                >
                  Simulate
                </button>
              </div>
            )}

            {/* Trending Markets Dropdown */}
            {showTrending && trendingMarkets.length > 0 && (
              <div className="mb-2 bg-[#304254]/95 backdrop-blur border border-[#3d4f61] rounded-lg max-h-[400px] overflow-y-auto">
                <div className="px-3 py-2 border-b border-[#3d4f61]">
                  <span className="text-xs font-bold text-white/80">TRENDING MARKETS</span>
                </div>
                {trendingMarkets.map((market) => {
                  const firstPrice = market.outcomePrices[0] || 0.5;
                  const isUp = firstPrice > 0.5;
                  
                  return (
                    <button
                      key={market.id}
                      onClick={() => {
                        setSelectedMarket(market);
                        setSelectedOutcome(market.outcomes[0]);
                        setShowTrending(false);
                      }}
                      className="w-full text-left p-3 border-b border-[#3d4f61] hover:bg-[#56afe2]/10 transition-colors last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        {/* Market Image */}
                        {market.image && (
                          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                            <img 
                              src={market.image} 
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium mb-1 line-clamp-2">
                            {market.question}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={isUp ? "text-green-400" : "text-red-400"}>
                              {isUp ? "↗" : "↘"} {(firstPrice * 100).toFixed(0)}%
                            </span>
                            <span className="text-white/40">·</span>
                            <span className="text-white/60">
                              ${(market.volume / 1000).toFixed(0)}k vol
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search Results Dropdown */}
            {showResults && searchResults.length > 0 && (
            <div className="mb-2 bg-[#304254]/95 backdrop-blur border border-[#3d4f61] rounded-lg max-h-[400px] overflow-y-auto">
              {searchResults.map((market) => {
                const firstPrice = market.outcomePrices[0] || 0.5;
                const isUp = firstPrice > 0.5;
                
                return (
                  <button
                    key={market.id}
                    onClick={() => {
                      setSelectedMarket(market);
                      setSelectedOutcome(market.outcomes[0]);
                      setShowResults(false);
                    }}
                    className="w-full text-left p-3 border-b border-[#3d4f61] hover:bg-[#56afe2]/10 transition-colors last:border-b-0"
                  >
                    <div className="flex items-start gap-3">
                      {/* Market Image */}
                      {market.image && (
                        <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                          <img 
                            src={market.image} 
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium mb-1 line-clamp-2">
                          {market.question}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={isUp ? "text-green-400" : "text-red-400"}>
                            {isUp ? "↗" : "↘"} {(firstPrice * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowResults(false);
                setShowTrending(true);
                setSearchQuery("");
              }
              if (e.key === 'Enter' && searchQuery.trim().length >= 3) {
                handleSearch(searchQuery);
              }
            }}
            onFocus={() => {
              if (!searchQuery) setShowTrending(true);
            }}
            placeholder="Search any market on Polymarket..."
            className="w-full bg-[#304254]/95 backdrop-blur border border-[#3d4f61] rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#56afe2] shadow-2xl"
            disabled={simulation.status === "running"}
          />
            {isSearching && (
              <div className="text-xs text-white/40 mt-2 text-center">Searching...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

