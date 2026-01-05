import React from 'react';
import { ChatMessage, MessageCitations } from '../types';
import { BrainCircuit, GraduationCap, RefreshCw, AlertCircle } from 'lucide-react';
import { marked } from 'marked';
import { TypingIndicator } from './TypingIndicator';
import { SourceChips } from './SourceChips';

interface Props {
  message: ChatMessage;
  onStop?: () => void;
  onRegenerate?: () => void;
  onViewCitations?: (citations: MessageCitations) => void;
}

export const MessageBubble: React.FC<Props> = ({ message, onStop, onRegenerate, onViewCitations }) => {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming;
  const isThinking = message.isThinking;
  const isError = message.status === 'error';
  const isStopped = message.status === 'stopped';

  // If completely empty and thinking, just show the indicator (no empty bubble)
  if (!isUser && isThinking && !message.text && !message.citations) {
      return (
          <TypingIndicator 
            state="thinking" 
            statusLabel={message.thinkingPhase} 
            onStop={onStop} 
            onRegenerate={onRegenerate}
          />
      );
  }

  const renderMarkdown = (text: string) => ({ __html: marked.parse(text) as string });

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : ''} group`}>
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-white text-black' : 'bg-accent/20 text-accent'}`}>
            {isUser ? 'U' : message.role === 'model' ? <BrainCircuit size={16}/> : <GraduationCap size={16}/>}
        </div>

        {/* Content Bubble */}
        <div className={`max-w-[85%] space-y-2 min-w-0`}>
            
            {/* Live Citation Indicator (Above bubble if streaming) */}
            {isStreaming && !isUser && (
                 <SourceChips 
                   citations={message.citations} 
                   isStreaming={true} 
                   onViewAll={() => message.citations && onViewCitations && onViewCitations(message.citations)}
                 />
            )}

            <div className={`p-4 rounded-2xl ${isUser ? 'bg-white/10 text-white' : 'bg-transparent border border-white/5'} ${isError ? 'border-red-500/30 bg-red-500/5' : ''}`}>
                
                {/* Text Content */}
                {message.text && (
                   <div className="markdown-body" dangerouslySetInnerHTML={renderMarkdown(message.text)} />
                )}
                
                {/* Stopped/Error Status */}
                {isStopped && <div className="text-xs text-orange-400 mt-2 font-mono">■ Stopped</div>}
                {isError && <div className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertCircle size={12}/> Generation Failed</div>}
            
                {/* Final Citation Row (Inside bubble footer) */}
                {!isStreaming && !isUser && message.citations && (
                     <SourceChips 
                        citations={message.citations} 
                        isStreaming={false} 
                        onViewAll={() => message.citations && onViewCitations && onViewCitations(message.citations)}
                     />
                )}
            </div>

            {/* Suggestions (Teach Mode) */}
            {message.suggestedActions && !isStreaming && (
                 <div className="flex flex-wrap gap-2">
                     {message.suggestedActions.map((action, i) => (
                         <div key={i} className="px-3 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300 text-xs hover:bg-teal-500/20 cursor-pointer transition">
                             {action}
                         </div>
                     ))}
                 </div>
            )}
            
            {/* Regenerate Action (Hover) */}
            {!isStreaming && !isUser && (
                <div className="opacity-0 group-hover:opacity-100 transition flex gap-2">
                    <button onClick={onRegenerate} className="text-xs text-secondary hover:text-white flex items-center gap-1">
                        <RefreshCw size={12}/> Regenerate
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};