"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Play, TrendingUp, TrendingDown } from "lucide-react";
import { PolymarketMarket } from "@/types/polymarket";

interface MarketSearchProps {
  onRunSimulation: (market: PolymarketMarket, outcome: string) => void;
  isLoading: boolean;
}

export default function MarketSearch({
  onRunSimulation,
  isLoading,
}: MarketSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string>("");
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetchTrendingMarkets();
  }, []);

  useEffect(() => {
    // Debounced search
    if (searchQuery) {
      const timer = setTimeout(() => {
        performSearch(searchQuery);
      }, 500); // Wait 500ms after user stops typing
      return () => clearTimeout(timer);
    } else {
      fetchTrendingMarkets();
    }
  }, [searchQuery]);

  const fetchTrendingMarkets = async () => {
    setLoadingMarkets(true);
    try {
      const response = await fetch("/api/polymarket/markets?trending=true&limit=50");
      if (response.ok) {
        const data = await response.json();
        console.log(`[MarketSearch] Loaded ${data.length} trending markets`);
        setMarkets(data);
      }
    } catch (error) {
      console.error("Failed to fetch trending markets:", error);
    } finally {
      setLoadingMarkets(false);
    }
  };

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      // Search ALL Polymarket markets
      const response = await fetch(`/api/polymarket/markets?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`[MarketSearch] Search for "${query}" found ${data.length} markets`);
        setMarkets(data);
      }
    } catch (error) {
      console.error("Failed to search markets:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRunSimulation = () => {
    if (selectedMarket && selectedOutcome) {
      onRunSimulation(selectedMarket, selectedOutcome);
    }
  };

  return (
    <div className="w-80 bg-black border-r border-white/20 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/20">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white/90">Market Search</h2>
          <div className="text-xs text-white/40">
            {searchQuery ? "Search Results" : "Trending"}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search all Polymarket markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40"
          />
        </div>
      </div>

      {/* Market List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {loadingMarkets || isSearching ? (
            <div className="text-center py-8 text-white/40">
              {isSearching ? "Searching..." : "Loading markets..."}
            </div>
          ) : markets.length === 0 ? (
            <div className="text-center py-8 text-white/40">
              {searchQuery ? "No markets found" : "No markets available"}
            </div>
          ) : (
            markets.map((market) => (
              <button
                key={market.id}
                onClick={() => {
                  setSelectedMarket(market);
                  setSelectedOutcome(market.outcomes[0] || "");
                }}
                className={`w-full text-left p-3 border transition-all ${
                  selectedMarket?.id === market.id
                    ? "bg-white/10 border-white/40"
                    : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/7"
                }`}
              >
                <div className="text-sm font-medium text-white line-clamp-2 mb-2">
                  {market.question}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {Array.isArray(market.outcomes) && market.outcomes.map((outcome, idx) => (
                      <span key={idx} className="text-white/60">
                        {outcome}: {(market.outcomePrices[idx] * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Selected Market Panel */}
      {selectedMarket && (
        <div className="border-t border-white/20 p-4 space-y-4">
          <div>
            <div className="text-xs text-white/60 mb-2">Selected Market</div>
            <div className="text-sm font-medium text-white line-clamp-2">
              {selectedMarket.question}
            </div>
          </div>

          <div>
            <div className="text-xs text-white/60 mb-2">Select Outcome</div>
            <div className="space-y-1">
              {Array.isArray(selectedMarket.outcomes) && selectedMarket.outcomes.map((outcome, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedOutcome(outcome)}
                  className={`w-full p-2 text-sm border transition-all ${
                    selectedOutcome === outcome
                      ? "bg-green-500/20 border-green-500/40 text-white"
                      : "bg-white/5 border-white/10 hover:border-white/20 text-white/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{outcome}</span>
                    <span className="text-white/60">
                      {(selectedMarket.outcomePrices[idx] * 100).toFixed(1)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleRunSimulation}
            disabled={!selectedOutcome || isLoading}
            className="w-full bg-white text-black hover:bg-white/90 disabled:opacity-50"
          >
            <Play className="mr-2 h-4 w-4" />
            {isLoading ? "Running..." : "Run Simulation"}
          </Button>
        </div>
      )}
    </div>
  );
}

