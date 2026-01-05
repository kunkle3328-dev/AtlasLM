import React from 'react';
import { X, FileText, Link, Youtube } from 'lucide-react';
import { Source } from '../types';

interface Props {
  source: Source;
  onClose: () => void;
}

export const SourceViewer: React.FC<Props> = ({ source, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#121212] border border-white/10 w-full max-w-3xl h-[80vh] rounded-xl flex flex-col shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-white/5 rounded-lg text-accent">
               {source.type === 'url' ? <Link size={18} /> : 
                source.type === 'youtube' ? <Youtube size={18} /> : <FileText size={18} />}
             </div>
             <div>
               <h3 className="font-bold text-white leading-tight">{source.title}</h3>
               <p className="text-xs text-secondary font-mono truncate max-w-md">{source.originalUrl || 'Uploaded File'}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-secondary hover:text-white transition">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 bg-[#0a0a0a]">
          <div className="max-w-none prose prose-invert prose-p:text-gray-300 prose-headings:font-serif">
             {source.content.split('\n\n').map((para, i) => (
               <p key={i} className="mb-4 text-base leading-relaxed">{para}</p>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};