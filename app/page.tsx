"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { Simulation } from "@/types/simulation";
import { PolyverseLoading } from "@/components/polyverse-loading";
import { motion } from "framer-motion";
import Image from "next/image";
import { PolymarketMarket } from "@/types/polymarket";

export default function Home() {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [showLoading, setShowLoading] = useState(true);
  const [loadingComplete, setLoadingComplete] = useState(false);

  useEffect(() => {
    // Load simulations from localStorage
    const stored = localStorage.getItem("polyverse_simulations");
    if (stored) {
      try {
        setSimulations(JSON.parse(stored));
      } catch (error) {
        console.error("Failed to load simulations:", error);
      }
    }
    
    // Trigger DB sync in background if needed
    fetch('/api/markets-db/sync').catch(err => {
      console.log('[Background] DB sync failed');
    });
  }, []);

  const handleLoadingComplete = () => {
    setLoadingComplete(true);
    setTimeout(() => setShowLoading(false), 500);
  };

  if (showLoading) {
    return <PolyverseLoading onComplete={handleLoadingComplete} />;
  }

  const createNewSimulation = () => {
    const newId = `sim_${Date.now()}`;
    window.location.href = `/simulation/${newId}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-[#1d2b3a] text-white">
      {/* Header */}
      <header className="border-b border-[#3d4f61] bg-[#1d2b3a]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/polyverse.png"
              alt="Polyverse Logo"
              width={32}
              height={32}
              className="w-8 h-8"
              unoptimized
            />
            <div>
              <h1 className="text-lg font-mono font-bold">Polyverse</h1>
              <p className="text-xs text-white/60 font-mono">Simulations</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-mono text-white mb-2">
              Welcome,
            </h2>
            <p className="text-sm font-mono text-white/60">
              Simulate prediction market outcomes
            </p>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            {simulations.length > 0 && (
              <Button
                onClick={() => {
                  if (confirm('Clear all simulations?')) {
                    localStorage.removeItem('polyverse_simulations');
                    setSimulations([]);
                  }
                }}
                variant="outline"
                className="font-mono border-[#3d4f61] text-white hover:bg-[#304254] text-sm"
              >
                Clear All
              </Button>
            )}
            <Button
              onClick={createNewSimulation}
              className="font-mono bg-[#56afe2] text-white hover:bg-[#56afe2]/90 flex-1 sm:flex-none text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Simulation
            </Button>
          </div>
        </div>

        {/* Simulations Grid */}
        {simulations.length === 0 ? (
          <div className="text-center py-16">
            <h3 className="text-lg font-mono text-white/80 mb-2">
              No simulations yet
            </h3>
            <p className="text-sm font-mono text-white/60 mb-6">
              Create your first simulation to analyze market relationships
            </p>
            <Button
              onClick={createNewSimulation}
              className="font-mono bg-[#56afe2] text-white hover:bg-[#56afe2]/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Simulation
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...simulations].reverse().map((sim, index) => (
              <motion.div
                key={sim.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="h-full"
              >
                <Card
                  className="bg-[#304254] border-[#3d4f61] hover:border-[#56afe2] transition-all cursor-pointer group h-full flex flex-col"
                  onClick={() => window.location.href = `/simulation/${sim.id}`}
                >
                  <CardHeader className="pb-0">
                    <div className="flex items-start gap-3">
                      {/* Market Image */}
                      {sim.scenarios && sim.scenarios[0]?.triggerMarket?.image && (
                        <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
                          <img 
                            src={sim.scenarios[0].triggerMarket.image} 
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <CardTitle className="font-mono text-white transition-colors text-base line-clamp-2 leading-snug mb-0">
                          {sim.triggerMarketQuestion}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-end pt-1">
                    {/* Stats and Button at bottom */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono border-t border-[#3d4f61] pt-1.5">
                        <div className="text-white/60">
                          {formatDate(sim.createdAt)}
                        </div>
                        {sim.scenarios.length > 0 && (
                          <div className="text-white/50">
                            {sim.scenarios[0].nodes.length} nodes
                          </div>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full font-mono text-white hover:bg-[#56afe2]/20 border border-[#3d4f61] group-hover:border-[#56afe2]"
                      >
                        Open Simulation →
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

