"use client";

import { Handle, Position } from 'reactflow';

interface PolymarketNodeProps {
  data: {
    question: string;
    currentProb: number;
    predictedProb: number;
    change: number;
    isTrigger?: boolean;
    impactLevel?: string;
  };
}

export function PolymarketNode({ data }: PolymarketNodeProps) {
  const change = Number(data.change) || 0;
  const currentProb = Number(data.currentProb) || 0;
  const predictedProb = Number(data.predictedProb) || 0;
  const isTrigger = Boolean(data.isTrigger);
  const isPositive = change > 0.001;

  // Calculate range (±30% confidence)
  const rangeMin = change > 0 
    ? change * 100 * 0.7 
    : change * 100 * 1.3; // For negative, multiply by 1.3 makes it MORE negative
  const rangeMax = change > 0 
    ? change * 100 * 1.3 
    : change * 100 * 0.7; // For negative, multiply by 0.7 makes it LESS negative

  return (
    <div className="relative">
      {/* Connection handles - invisible */}
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      
      {/* Custom Polymarket-style card */}
      <div 
        className={`w-[280px] min-h-[120px] p-4 rounded-lg border-2 transition-colors ${
          isTrigger 
            ? 'bg-[#304254] border-[#56afe2]'
            : isPositive
            ? 'bg-[#304254] border-green-500/50'
            : 'bg-[#304254] border-red-500/50'
        }`}
      >
        {/* Question */}
        <div className="text-sm font-medium text-white mb-3 line-clamp-2 leading-tight">
          {data.question}
        </div>
        
        {/* Current probability */}
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="text-white/60">
            Current: {(currentProb * 100).toFixed(1)}%
          </div>
          
          {isTrigger ? (
            <div className="text-white font-bold text-xs px-2 py-0.5 bg-white/20 rounded">
              TRIGGER
            </div>
          ) : (
            <div className={`flex flex-col items-end font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              <div className="flex items-center gap-1">
                {isPositive ? '↑' : '↓'}
                <span className="text-xs">{isPositive ? 'UP' : 'DOWN'}</span>
              </div>
              <div className="text-[10px] font-normal text-white/50 mt-0.5">
                {rangeMin.toFixed(1)}% to {rangeMax.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

