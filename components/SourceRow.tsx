import React from 'react';
import { 
  FileText, Link, Youtube, Loader2, CheckCircle, 
  AlertCircle, X, RefreshCw, Trash2 
} from 'lucide-react';
import { Source } from '../types';

interface Props {
  source: Source;
  onClick: () => void;
  onRetry: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

export const SourceRow: React.FC<Props> = ({ source, onClick, onRetry, onRemove }) => {
  const isReady = source.status === 'ready';
  const isFailed = source.status === 'failed';
  const isIngesting = !isReady && !isFailed && source.status !== 'canceled';

  return (
    <div 
      onClick={isReady ? onClick : undefined}
      className={`
        relative overflow-hidden rounded-lg border transition-all duration-300 group
        ${isReady ? 'border-transparent hover:bg-white/5 hover:border-white/10 cursor-pointer' : ''}
        ${isIngesting ? 'bg-white/[0.02] border-indigo-500/20' : ''}
        ${isFailed ? 'bg-red-500/5 border-red-500/20' : ''}
      `}
    >
      {/* Active Ingestion Shimmer Overlay - Subtle */}
      {isIngesting && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-shimmer" />
        </div>
      )}

      <div className="relative z-10 p-3 flex items-start gap-3">
        {/* Icon */}
        <div className={`mt-0.5 shrink-0 transition-colors duration-300
          ${isReady ? 'text-secondary group-hover:text-accent' : ''}
          ${isIngesting ? 'text-accent animate-pulse' : ''}
          ${isFailed ? 'text-red-400' : ''}
        `}>
          {source.type === 'url' ? <Link size={16} /> : 
           source.type === 'youtube' ? <Youtube size={16} /> : <FileText size={16} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h4 className={`text-sm font-medium truncate max-w-[180px] ${isFailed ? 'text-red-200' : 'text-gray-200'}`}>
              {source.title}
            </h4>
            
            {/* Actions */}
            <div className="flex items-center gap-1">
              {isFailed && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onRetry(); }} 
                  className="p-1 hover:bg-white/10 rounded text-secondary hover:text-white"
                  title="Retry"
                >
                  <RefreshCw size={14} />
                </button>
              )}
              <button 
                onClick={onRemove}
                className="p-1 hover:bg-white/10 rounded text-secondary hover:text-red-400 transition"
                title="Remove"
              >
                {isIngesting ? <X size={14} /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>

          {/* Subtext / Status */}
          <div className="mt-1 flex items-center justify-between text-[10px] leading-none h-4">
             {isIngesting && (
               <div className="flex items-center gap-2 text-accent w-full">
                 <span className="font-medium">{source.stageLabel}</span>
                 <span className="opacity-60">{source.ingestProgress}%</span>
               </div>
             )}
             
             {isReady && (
               <span className="text-gray-500 flex items-center gap-1.5 animate-in fade-in duration-500">
                 <CheckCircle size={10} className="text-green-500/80 animate-pop" />
                 Ready • {new Date(source.createdAt).toLocaleDateString()}
               </span>
             )}

             {isFailed && (
               <span className="text-red-400 flex items-center gap-1.5">
                 <AlertCircle size={10} />
                 {source.error?.message || 'Failed'}
               </span>
             )}
          </div>
        </div>
      </div>
      
      {/* Bottom Progress Line (Smoother) */}
      {isIngesting && (
        <div className="h-0.5 w-full bg-white/5 mt-1 relative overflow-hidden">
          <div 
             className="h-full bg-accent transition-all duration-700 ease-out shadow-[0_0_10px_rgba(124,140,255,0.5)]" 
             style={{ width: `${source.ingestProgress}%` }} 
          />
        </div>
      )}
    </div>
  );
};