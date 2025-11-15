"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface PolyverseLoadingProps {
  onComplete: () => void;
}

const loadingSteps = [
  "Initializing Engine",
  "Connecting to Polymarket API", 
  "Fetching all markets",
  "Building search index",
  "Caching for fast access",
  "Ready to simulate"
];

export function PolyverseLoading({ onComplete }: PolyverseLoadingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isFetchingMarkets, setIsFetchingMarkets] = useState(false);

  useEffect(() => {
    // Trigger initial DB sync if needed (in background)
    fetch('/api/markets-db/sync').catch(err => {
      console.log('[Loading] Background DB sync failed:', err);
    });
    
    const totalDuration = 4000; // 4 seconds total
    const stepDuration = totalDuration / loadingSteps.length;
    
    // Auto-increment progress - animation is independent
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + (100 / (totalDuration / 50));
        if (newProgress >= 100) {
          clearInterval(progressInterval);
          setTimeout(() => {
            setIsComplete(true);
            setTimeout(onComplete, 500);
          }, 200);
          return 100;
        }
        return newProgress;
      });
    }, 50);

    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        const nextStep = prev + 1;
        if (nextStep >= loadingSteps.length) {
          clearInterval(stepInterval);
          return prev;
        }
        return nextStep;
      });
    }, stepDuration);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
    };
  }, [onComplete]);

  // Generate progress bars (similar to the image you showed)
  const totalBars = 32;
  const filledBars = Math.floor((progress / 100) * totalBars);

  return (
    <AnimatePresence>
      {!isComplete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 bg-[#1d2b3a] flex items-center justify-center z-50"
        >
          <div className="w-full max-w-2xl mx-4 sm:mx-auto px-6 sm:px-8 py-8 sm:py-12 bg-[#304254] rounded-lg border border-[#3d4f61]">
            {/* Header */}
            <div className="mb-8 text-left">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-white/60 text-sm font-mono">Prediction</span>
                <span className="text-white/60 text-sm font-mono">Market</span>
                <span className="text-white/60 text-sm font-mono">Simulation</span>
              </div>
              <div className="flex items-center gap-3">
                <Image
                  src="/polyverse.png"
                  alt="Polyverse Logo"
                  width={40}
                  height={40}
                  className="w-10 h-10 mt-1"
                  unoptimized
                />
                <h1 className="text-white text-4xl font-mono font-bold">Polyverse</h1>
              </div>
            </div>

            {/* Loading Text */}
            <div className="mb-8">
              <motion.p 
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="text-white/80 text-base font-mono mb-2"
              >
                {loadingSteps[currentStep]}
              </motion.p>
            </div>

            {/* Progress Percentage */}
            <div className="mb-6 flex items-center gap-4">
              <motion.span 
                className="text-white text-6xl font-mono"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                {Math.floor(progress)}%
              </motion.span>
              <div className="flex items-center gap-1">
                <span className="text-white/40 text-sm font-mono">↗</span>
                <span className="text-white/40 text-sm font-mono">
                  {progress < 100 ? `${Math.floor(progress * 0.14)}%` : '14%'}
                </span>
                <span className="text-white/60 text-sm font-mono ml-2">
                  since you last checked
                </span>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="flex gap-1.5 mb-6">
              {Array.from({ length: totalBars }, (_, i) => (
                <motion.div
                  key={i}
                  className={`h-10 flex-1 ${
                    i < filledBars 
                      ? 'bg-white' 
                      : 'bg-white/20'
                  }`}
                  initial={{ scaleY: 0 }}
                  animate={{ 
                    scaleY: 1,
                    backgroundColor: i < filledBars ? '#ffffff' : 'rgba(255, 255, 255, 0.2)'
                  }}
                  transition={{ 
                    delay: i * 0.02,
                    duration: 0.3,
                    backgroundColor: { duration: 0.2 }
                  }}
                  style={{ originY: 1 }}
                />
              ))}
            </div>

            {/* Bottom indicator */}
            <div className="flex justify-center">
              <div className="w-8 h-1 bg-white/40 rounded-full" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

