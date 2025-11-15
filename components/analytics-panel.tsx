"use client";

import React, { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Simulation, SimulationScenario } from "@/types/simulation";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface AnalyticsPanelProps {
  simulation: Simulation;
  scenario: SimulationScenario | null;
  selectedNode: string | null;
}

export default function AnalyticsPanel({
  simulation,
  scenario,
  selectedNode,
}: AnalyticsPanelProps) {
  const selectedSimNode = scenario?.nodes.find((n) => n.market.id === selectedNode);
  const router = useRouter();

  // Load Polymarket embed script
  useEffect(() => {
    if (!document.querySelector('script[src*="polymarket/embeds"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@polymarket/embeds@latest/dist/index.js';
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="w-full md:w-96 h-full bg-[#1d2b3a] md:border-r border-[#3d4f61] flex flex-col">
      {/* Polyverse Logo Header */}
      <div className="px-4 py-5 border-b border-[#3d4f61]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/polyverse.png"
              alt="Polyverse"
              width={40}
              height={40}
              className="w-10 h-10"
              unoptimized
            />
            <span className="text-xl font-bold">Polyverse</span>
          </div>
          
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-white/80" />
          </button>
        </div>
      </div>
      {/* Status Section */}
      <div className="p-4 border-b border-[#3d4f61]">
        <div>
          <div className="text-xs text-white/60 mb-2">SIMULATION STATUS</div>
          <Badge
            variant={
              simulation.status === "complete"
                ? "default"
                : simulation.status === "running"
                ? "secondary"
                : "outline"
            }
            className="uppercase"
          >
            {simulation.status}
          </Badge>
        </div>
      </div>

      {/* Details Panel */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {selectedSimNode ? (
            /* Selected Node Details */
            <>
              {/* Polymarket Embed Card - FIRST */}
              {selectedSimNode.market.slug && (
                <div>
                  <div className="text-xs text-white/60 mb-2">LIVE MARKET</div>
                  <div id="polymarket-embed-container">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: `
                          <polymarket-market-embed
                            market="${selectedSimNode.market.slug}"
                            volume="true"
                            chart="false"
                            theme="dark"
                          ></polymarket-market-embed>
                        `
                      }}
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs text-white/60 mb-2">SELECTED MARKET</div>
                <div className="text-sm font-medium text-white mb-4">
                  {selectedSimNode.market.question}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-white/60 mb-1">Current Probability</div>
                <div className="text-lg font-bold text-white">
                  {(selectedSimNode.currentProbability * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs text-white/60 mb-2">Expected Impact</div>
              <div className="flex items-center gap-3">
                <div
                  className={`text-4xl font-bold ${
                    selectedSimNode.probabilityChange > 0
                      ? "text-green-400"
                      : selectedSimNode.probabilityChange < 0
                      ? "text-red-400"
                      : "text-white/60"
                  }`}
                >
                  {selectedSimNode.probabilityChange > 0 ? "↑" : selectedSimNode.probabilityChange < 0 ? "↓" : "—"}
                </div>
                <div>
                  <div className={`text-xl font-bold ${
                    selectedSimNode.probabilityChange > 0 ? "text-green-400" : "text-red-400"
                  }`}>
                    {selectedSimNode.probabilityChange > 0 ? "INCREASE" : "DECREASE"}
                  </div>
                  <div className="text-sm text-white/60 mt-1">
                    Range: {selectedSimNode.probabilityChange > 0 ? '+' : ''}{Math.max(selectedSimNode.probabilityChange * 100 * 0.7, 0).toFixed(1)}% to {selectedSimNode.probabilityChange > 0 ? '+' : ''}{Math.min(selectedSimNode.probabilityChange * 100 * 1.3, selectedSimNode.probabilityChange < 0 ? 0 : 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

              {selectedSimNode.incomingLinks.length > 0 && (
                <div>
                  <div className="text-xs text-white/60 mb-2">RELATIONSHIP EXPLANATION</div>
                  <div className="space-y-2">
                    {selectedSimNode.incomingLinks.map((link, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white/5 border border-white/10 text-xs"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant={
                              link.confidenceLevel === "HIGH"
                                ? "default"
                                : link.confidenceLevel === "MEDIUM"
                                ? "secondary"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {link.confidenceLevel}
                          </Badge>
                          {link.llmGenerated && (
                            <Badge variant="outline" className="text-xs">
                              AI
                            </Badge>
                          )}
                          <span className="text-white/60">{link.timelag}</span>
                        </div>
                        <p className="text-white/80 leading-relaxed">
                          {link.explanation}
                        </p>
                        {link.historicalCorrelation && (
                          <div className="mt-2 text-white/60">
                            Historical correlation:{" "}
                            {(link.historicalCorrelation.correlation * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : scenario ? (
            /* Overall Simulation Stats */
            <>
              <div>
                <div className="text-xs text-white/60 mb-2">TRIGGER</div>
                <div className="text-sm font-medium text-white mb-1">
                  {scenario.triggerMarket.question}
                </div>
                <div className="text-xs text-white/60">
                  Outcome: {scenario.triggerOutcome}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-white/60 mb-1">Markets Affected</div>
                  <div className="text-xl font-bold text-white">
                    {scenario.metadata.totalMarketsAffected}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/60 mb-1">Avg Shift</div>
                  <div className="text-xl font-bold text-white">
                    {(scenario.metadata.avgProbabilityShift * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-white/60 mb-1">Max Shift</div>
                <div className="text-xl font-bold text-white">
                  {(scenario.metadata.maxProbabilityShift * 100).toFixed(1)}%
                </div>
              </div>

              <div>
                <div className="text-xs text-white/60 mb-1">Time Horizon</div>
                <div className="text-sm text-white capitalize">
                  {scenario.metadata.timeHorizon}
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="text-xs text-white/60 mb-2">SIMULATION INFO</div>
                <div className="text-xs text-white/80 space-y-1">
                  <div>• Click a node to see details</div>
                  <div>• Solid lines = historical data</div>
                  <div>• Dashed lines = AI prediction</div>
                  <div>• Line thickness = confidence</div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="text-white/40 text-sm">
                No simulation data yet
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

