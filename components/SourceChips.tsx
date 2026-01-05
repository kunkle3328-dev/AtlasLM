import React from 'react';
import { FileText, Link, Youtube, Loader2, Database, ChevronRight } from 'lucide-react';
import { MessageCitations, Citation } from '../types';

interface Props {
  citations?: MessageCitations;
  isStreaming?: boolean;
  onViewAll: () => void;
}

export const SourceChips: React.FC<Props> = ({ citations, isStreaming, onViewAll }) => {
  const count = citations?.citations.length || 0;
  
  // State 1: Generating
  if (isStreaming) {
    if (count > 0) {
      return (
        <div className="flex items-center gap-2 mb-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="h-6 px-2.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-2">
            <Loader2 size={10} className="text-indigo-400 animate-spin" />
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wide">
              Using {count} Source{count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      );
    } else {
      // Searching state (no sources found yet)
      return (
        <div className="flex items-center gap-2 mb-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="h-6 px-2.5 rounded-full bg-white/5 border border-white/5 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            <span className="text-[10px] font-medium text-secondary uppercase tracking-wide">
              Using sources...
            </span>
          </div>
        </div>
      );
    }
  }

  // State 2: Complete but no sources
  if (count === 0) {
    return (
       <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
         <span className="text-[10px] text-gray-500 italic">No sources used. Answer may be general.</span>
       </div>
    );
  }

  // State 3: Complete with sources
  const topSources = citations?.citations.slice(0, 3) || [];

  return (
    <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center gap-2 animate-in fade-in">
      {/* Primary Count Pill */}
      <button 
        onClick={onViewAll}
        className="h-6 px-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center gap-1.5 transition group"
      >
        <Database size={10} className="text-secondary group-hover:text-white" />
        <span className="text-[10px] font-bold text-secondary group-hover:text-white">
          Sources: {count}
        </span>
      </button>

      {/* Chips */}
      {topSources.map((cite, i) => (
        <button 
          key={i} 
          onClick={onViewAll}
          className="h-6 px-2.5 rounded-full bg-[#1A1A1A] border border-white/5 hover:border-white/20 hover:bg-[#222] flex items-center gap-1.5 transition max-w-[140px]"
        >
          {cite.sourceType === 'url' ? <Link size={10} className="text-accent shrink-0"/> : 
           cite.sourceType === 'youtube' ? <Youtube size={10} className="text-red-400 shrink-0"/> : 
           <FileText size={10} className="text-gray-400 shrink-0"/>}
          <span className="text-[10px] text-gray-300 truncate font-medium">
             {cite.sourceTitle}
          </span>
        </button>
      ))}

      {/* View All */}
      <button onClick={onViewAll} className="p-1 text-secondary hover:text-white transition">
         <ChevronRight size={14} />
      </button>
    </div>
  );
};