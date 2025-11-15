"use client";

import React, { useEffect, useState, useMemo } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { SimulationScenario } from "@/types/simulation";
import { PolymarketNode } from "@/components/polymarket-node";

interface CausalGraphProps {
  scenario: SimulationScenario | null;
  onNodeSelect: (nodeId: string | null) => void;
  selectedNode: string | null;
  isLoading?: boolean;
}

// Dagre layout for automatic positioning
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB", ranksep: 120, nodesep: 40 }); // TB = top to bottom, compact layout

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 250, height: 120 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 125,
        y: nodeWithPosition.y - 60,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// Define custom node types
const nodeTypes: NodeTypes = {
  polymarketCard: PolymarketNode,
};

export default function CausalGraph({
  scenario,
  onNodeSelect,
  selectedNode,
  isLoading = false,
}: CausalGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!scenario) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Convert simulation nodes to React Flow nodes
    const flowNodes: Node[] = scenario.nodes.map((simNode) => {
      const change = simNode.probabilityChange;
      const isPositive = change > 0;
      const isTrigger = simNode.layer === 0;

      return {
        id: simNode.market.id,
        type: "polymarketCard", // Use custom card node
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          question: simNode.market.question,
          currentProb: simNode.currentProbability,
          predictedProb: simNode.predictedProbability,
          change: simNode.probabilityChange,
          isTrigger: isTrigger,
          impactLevel: simNode.impactLevel,
        },
        style: {
          background: "transparent",
          border: "none",
          padding: 0,
        },
      };
    });

    // Convert causal links to React Flow edges
    const flowEdges: Edge[] = scenario.edges.map((link, idx) => {
      const isHighConfidence = link.confidenceLevel === "HIGH";
      const isMediumConfidence = link.confidenceLevel === "MEDIUM";

      return {
        id: `edge-${idx}`,
        source: link.sourceMarketId,
        target: link.targetMarketId,
        type: "default",
        animated: isHighConfidence,
        style: {
          stroke: isHighConfidence
            ? "#56afe2"
            : isMediumConfidence
            ? "#56afe2"
            : "#56afe2",
          strokeWidth: isHighConfidence ? 3 : 2,
          opacity: isHighConfidence ? 0.8 : isMediumConfidence ? 0.5 : 0.3,
          strokeDasharray: link.llmGenerated ? "5,5" : "0",
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: isHighConfidence
            ? "#56afe2"
            : "#56afe2",
        },
        label: link.timelag !== "immediate" ? link.timelag : undefined,
        labelStyle: {
          fill: "white",
          fontSize: 10,
          fontWeight: 400,
        },
        labelBgStyle: {
          fill: "#1d2b3a",
          fillOpacity: 0.9,
        },
      };
    });

    // Apply dagre layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      flowNodes,
      flowEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [scenario, setNodes, setEdges]);

  const onNodeClick = (_event: React.MouseEvent, node: Node) => {
    onNodeSelect(node.id);
  };

  return (
    <div className="w-full h-full bg-[#1d2b3a] relative">
      {/* Hide React Flow attribution */}
      <style jsx global>{`
        .react-flow__attribution {
          display: none !important;
        }
        
        @keyframes progress {
          0% {
            width: 5%;
          }
          20% {
            width: 25%;
          }
          40% {
            width: 45%;
          }
          60% {
            width: 65%;
          }
          80% {
            width: 85%;
          }
          100% {
            width: 95%;
          }
        }
        
        @keyframes dots {
          0%, 20% {
            content: '.';
          }
          40% {
            content: '..';
          }
          60%, 100% {
            content: '...';
          }
        }
      `}</style>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-sm">
            <div className="text-white text-lg mb-3">
              Running Simulation
              <span className="inline-block w-8 text-left animate-pulse">
                <span className="animate-[dots_1.5s_ease-in-out_infinite]">...</span>
              </span>
            </div>
            {/* Thick progress bar */}
            <div className="w-80 mx-auto h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" 
                   style={{
                     animation: 'progress 15s ease-out forwards'
                   }}></div>
            </div>
          </div>
        </div>
      ) : scenario ? (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: "smoothstep",
          }}
          className="bg-[#1d2b3a]"
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
        >
          <Background color="#56afe2" gap={20} size={1} className="opacity-5" />
        </ReactFlow>
      ) : (
        <div className="flex items-center justify-center h-full pt-20">
          <div className="text-center max-w-md px-6">
            <h3 className="text-xl font-bold text-white mb-2">No Simulation Yet</h3>
            <p className="text-white/60 text-sm">
              Search for any market below to start simulating market relationships.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

