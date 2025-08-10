import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';

interface RestTimerProps {
  duration: number;
  onComplete: () => void;
  exerciseName?: string;
}

export const RestTimer: React.FC<RestTimerProps> = ({ duration, onComplete, exerciseName }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);
  
  useEffect(() => {
    if (isPaused) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [duration, onComplete, isPaused]);
  
  const progress = ((duration - timeLeft) / duration) * 100;
  const radius = 60; // Increased from 40 for better visibility
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  const getRestTip = () => {
    const tips = [
      'Take deep breaths',
      'Stay hydrated',
      'Keep moving lightly',
      'Focus on your form',
      'Prepare for the next set'
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  };
  
  return (
    <div className="flex flex-col items-center justify-center space-y-3 p-4">
      <div className="relative">
        {/* Background circle */}
        <svg width="140" height="140" className="transform -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="10"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            stroke="rgb(34, 197, 94)"
            strokeWidth="10"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        
        {/* Timer display */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl font-bold text-white">{timeLeft}</div>
            <div className="text-sm text-white/80">seconds</div>
          </div>
        </div>
      </div>
      
      {/* Rest tip */}
      <div className="text-xs text-white/70 text-center">
        {getRestTip()}
      </div>
      
      {/* Next exercise reminder */}
      {exerciseName && (
        <div className="text-xs text-green-400 text-center">
          Next: {exerciseName}
        </div>
      )}
      
      {/* Pause/Skip button */}
      <div className="flex gap-2">
        <button
          onClick={() => setIsPaused(!isPaused)}
          className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition-colors"
        >
          {isPaused ? <Play className="w-3 h-3" /> : 'Pause'}
        </button>
        <button
          onClick={onComplete}
          className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
};