import React, { useEffect, useState } from 'react';
import { Loader2, Square, Sparkles, BrainCircuit, RefreshCw, AlertCircle } from 'lucide-react';

interface Props {
  state: 'thinking' | 'drafting' | 'finalizing';
  statusLabel?: string;
  onStop?: () => void;
  onRegenerate?: () => void;
  isStreaming?: boolean;
}

export const TypingIndicator: React.FC<Props> = ({ 
  state, statusLabel, onStop, onRegenerate, isStreaming 
}) => {
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSecondsElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Timeout UX logic
  let helperText = statusLabel;
  if (!helperText) {
      if (state === 'thinking') helperText = "Atlas is thinking...";
      if (state === 'drafting') helperText = "Atlas is responding...";
      if (state === 'finalizing') helperText = "Finalizing...";
      
      if (secondsElapsed > 3 && state === 'thinking') helperText = "Reviewing sources...";
      if (secondsElapsed > 8 && state === 'thinking') helperText = "This is taking longer than usual...";
  }

  const showLongWaitActions = secondsElapsed > 15 && state === 'thinking';

  return (
    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-3">
          {/* Avatar / Icon */}
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
             {state === 'thinking' ? (
                 <BrainCircuit size={16} className="text-accent animate-pulse" />
             ) : (
                 <Sparkles size={16} className="text-accent" />
             )}
          </div>

          {/* Bubble content */}
          <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-3 rounded-2xl rounded-tl-none">
              
              {/* Typing Animation */}
              <div className="flex gap-1 h-2 items-center">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-typing" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-typing" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-typing" style={{ animationDelay: '300ms' }} />
              </div>

              {/* Status Text */}
              <span className="text-xs font-medium text-secondary min-w-[120px]">
                  {helperText}
              </span>

              {/* Stop Control */}
              {onStop && (
                  <button 
                    onClick={onStop} 
                    className="ml-2 p-1 hover:bg-white/10 rounded-full text-secondary hover:text-white transition"
                    title="Stop generation"
                  >
                      <Square size={12} fill="currentColor" />
                  </button>
              )}
          </div>
      </div>

      {/* Timeout Recovery Actions */}
      {showLongWaitActions && (
          <div className="pl-12 flex gap-2">
             <button onClick={onRegenerate} className="text-xs flex items-center gap-1 text-orange-400 hover:text-orange-300 transition">
                 <RefreshCw size={12} /> Retry
             </button>
             <span className="text-xs text-gray-600">•</span>
             <span className="text-xs text-gray-500">Network might be slow</span>
          </div>
      )}
    </div>
  );
};