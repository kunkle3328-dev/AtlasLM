import React from 'react';
import { CheckCircle2, Circle, Loader2, FileText, Database, X, AlertTriangle } from 'lucide-react';
import { Source } from '../types';

interface Props {
  source: Source;
  onClose: () => void;
}

export const SourceDetailsSheet: React.FC<Props> = ({ source, onClose }) => {
  
  const renderStep = (label: string, isDone: boolean, isCurrent: boolean, isError: boolean) => (
    <div className={`flex items-center gap-3 py-2 ${isError ? 'opacity-100' : isDone || isCurrent ? 'opacity-100' : 'opacity-40'}`}>
      <div className="shrink-0">
        {isError ? <AlertTriangle className="text-red-500" size={18} /> :
         isDone ? <CheckCircle2 className="text-green-500" size={18} /> : 
         isCurrent ? <Loader2 className="animate-spin text-accent" size={18} /> :
         <Circle className="text-gray-600" size={18} />}
      </div>
      <span className={`text-sm ${isCurrent ? 'text-white font-medium' : isError ? 'text-red-400' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  );

  const getStepState = (threshold: number) => {
     if (source.status === 'failed') return { isDone: false, isCurrent: false, isError: true };
     const isDone = source.ingestProgress > threshold;
     const isCurrent = source.ingestProgress <= threshold && source.ingestProgress > (threshold - 20); // Rough approximation
     return { isDone, isCurrent, isError: false };
  };

  // Determine active step index for cleaner logic
  const progress = source.ingestProgress;
  const isReady = source.status === 'ready';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-[#121212] border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-start justify-between">
           <div>
              <h3 className="font-serif font-bold text-xl text-white pr-4 leading-tight">{source.title}</h3>
              <p className="text-xs text-secondary mt-1 font-mono truncate max-w-[280px]">
                 {source.originalUrl || 'Local File Upload'}
              </p>
           </div>
           <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-secondary hover:text-white transition">
             <X size={20}/>
           </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
            
            {/* Pipeline Visualizer */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                <h4 className="text-xs font-bold text-secondary uppercase mb-3 tracking-wider">Ingestion Pipeline</h4>
                <div className="space-y-1">
                   {renderStep("Fetch & Validate", progress > 25, progress <= 25 && progress > 0, false)}
                   {renderStep("Parse & Clean Structure", progress > 50, progress <= 50 && progress > 25, false)}
                   {renderStep("Semantic Chunking", progress > 80, progress <= 80 && progress > 50, false)}
                   {renderStep("Vector Embedding & Indexing", isReady, progress > 80 && !isReady, false)}
                </div>
            </div>

            {/* Metrics (Only if some progress made) */}
            {source.stats && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-indigo-400 mb-1">
                            <FileText size={14}/>
                            <span className="text-[10px] font-bold uppercase">Content Size</span>
                        </div>
                        <div className="text-xl font-bold text-white">
                           {Math.round((source.stats.charsCount || 0) / 1024)} <span className="text-xs text-indigo-300 font-normal">KB</span>
                        </div>
                    </div>
                    <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-teal-400 mb-1">
                            <Database size={14}/>
                            <span className="text-[10px] font-bold uppercase">Chunks</span>
                        </div>
                        <div className="text-xl font-bold text-white">
                           {source.stats.chunksCount || 0}
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {source.status === 'failed' && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18}/>
                    <div>
                        <h4 className="text-sm font-bold text-red-200">Ingestion Failed</h4>
                        <p className="text-xs text-red-300 mt-1 leading-relaxed">{source.error?.message}</p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};