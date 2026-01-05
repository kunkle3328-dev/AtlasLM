import React from 'react';
import { X, FileText, Link, Youtube, ExternalLink, Copy, Check } from 'lucide-react';
import { MessageCitations } from '../types';

interface Props {
  citations: MessageCitations;
  onClose: () => void;
}

export const CitationSheet: React.FC<Props> = ({ citations, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    const text = citations.citations.map(c => `[${c.index}] ${c.sourceTitle} (${c.url || 'File'})`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-[#121212] border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
           <h3 className="font-serif font-bold text-lg text-white pl-2">Sources for this answer</h3>
           <div className="flex items-center gap-2">
               <button 
                  onClick={handleCopy}
                  className="p-2 hover:bg-white/5 rounded-full text-secondary hover:text-white transition flex items-center gap-1.5"
                  title="Copy Citations"
               >
                  {copied ? <Check size={16} className="text-green-500"/> : <Copy size={16}/>}
               </button>
               <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-secondary hover:text-white transition">
                 <X size={20}/>
               </button>
           </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {citations.citations.map((cite) => (
                <div key={cite.index} className="bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:bg-white/[0.05] transition-colors group">
                    <div className="flex items-start gap-3 mb-2">
                        <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-secondary border border-white/5">
                            {cite.index}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-gray-200 leading-tight mb-1 flex items-center gap-2">
                                {cite.sourceTitle}
                                {cite.sourceType === 'url' && <ExternalLink size={10} className="opacity-0 group-hover:opacity-50 transition"/>}
                            </h4>
                            <div className="flex items-center gap-2 text-[10px] text-secondary uppercase tracking-wider font-medium">
                                <span className="flex items-center gap-1">
                                    {cite.sourceType === 'url' ? <Link size={10}/> : cite.sourceType === 'youtube' ? <Youtube size={10}/> : <FileText size={10}/>}
                                    {cite.sourceType}
                                </span>
                                {cite.locator && (
                                    <>
                                        <span>•</span>
                                        <span>{cite.locator}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {cite.quote && (
                        <div className="pl-9 relative">
                            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-accent/20"/>
                            <p className="text-xs text-gray-400 italic line-clamp-3 leading-relaxed">
                                "{cite.quote}"
                            </p>
                        </div>
                    )}
                    
                    {cite.url && (
                        <a 
                          href={cite.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="mt-3 ml-9 inline-flex items-center gap-1.5 text-[10px] font-bold text-accent hover:text-white transition"
                        >
                            Open Source <ExternalLink size={10}/>
                        </a>
                    )}
                </div>
            ))}
        </div>
        
        {/* Footer */}
        <div className="p-3 border-t border-white/5 bg-[#0a0a0a] text-center">
             <p className="text-[10px] text-gray-600">
                AI can make mistakes. Verify important info.
             </p>
        </div>
      </div>
    </div>
  );
};