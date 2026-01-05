import React, { useRef, useEffect, useState } from 'react';
import { 
  Play, Pause, Loader2, X, SkipForward, SkipBack, 
  ListMusic, ChevronUp, ChevronDown, BookOpen, 
  GraduationCap, Bookmark, Sparkles 
} from 'lucide-react';
import { AudioOverviewState, PodcastTurn } from '../types';

interface Props {
  state: AudioOverviewState;
  onTogglePlay: () => void;
  onClose: () => void;
  onSegmentEnd: () => void;
  onJumpToSegment: (index: number) => void;
  onAction: (action: 'teach' | 'study_guide' | 'takeaways', topic?: string) => void;
  bottomOffset?: string; 
}

export const AudioPlayer: React.FC<Props> = ({ 
  state, onTogglePlay, onClose, onSegmentEnd, onJumpToSegment, onAction, bottomOffset = '0px'
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onSegmentEndRef = useRef(onSegmentEnd);
  
  // Local playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentBuffer, setCurrentBuffer] = useState<AudioBuffer | null>(null);

  // Keep callback fresh to avoid stale closures (e.g. old turns length)
  useEffect(() => {
    onSegmentEndRef.current = onSegmentEnd;
  }, [onSegmentEnd]);

  // Auto-scroll logic
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
        const activeEl = document.getElementById(`turn-${state.currentTurnIndex}`);
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
  }, [state.currentTurnIndex, isExpanded]);

  // Derived state for effect dependencies
  const currentTurn = state.turns[state.currentTurnIndex];
  const currentTurnId = currentTurn?.id;
  const currentAudioData = currentTurn?.audioBase64;

  // --- Audio Engine (Sequential Turn-Based) ---
  useEffect(() => {
    if (!state.isPlaying) {
        stopAudio();
        setIsPlaying(false);
        return;
    }

    if (!currentTurnId) return;

    const playCurrentTurn = async () => {
      // 1. Check if audio is ready
      if (!currentAudioData) {
          setIsBuffering(true);
          return; // Wait for parent to populate audio
      }

      // 2. Decode and Play
      setIsBuffering(false); 
      
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }

        // Decode
        const binaryString = atob(currentAudioData);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const float32 = new Float32Array(new Int16Array(bytes.buffer).length);
        const int16 = new Int16Array(bytes.buffer);
        for (let i=0; i<int16.length; i++) float32[i] = int16[i] / 32768.0;
        
        const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);
        
        setCurrentBuffer(buffer);
        playBuffer(buffer);
        setIsPlaying(true);

      } catch (e) {
        console.error("Audio error", e);
        setIsBuffering(false);
        // Skip corrupted segment safely using ref
        onSegmentEndRef.current(); 
      }
    };

    playCurrentTurn();
    
    return () => { stopAudio(); };
    // CRITICAL FIX: Only re-run if the *specific* turn ID or its audio data changes.
    // Do NOT include `state.turns` or `state.currentTurnIndex` directly to avoid 
    // loops when background generation updates the array.
  }, [currentTurnId, currentAudioData, state.isPlaying]);

  const playBuffer = (buffer: AudioBuffer) => {
      if (!audioContextRef.current) return;
      if (sourceNodeRef.current) try { sourceNodeRef.current.stop(); } catch(e){}

      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
      sourceNodeRef.current = source;

      source.onended = () => {
          // Add micro-pause before next turn for natural flow
          setTimeout(() => {
              // Use ref to call the latest version of the callback
              onSegmentEndRef.current(); 
          }, 350); 
      };
  };

  const stopAudio = () => {
     if (sourceNodeRef.current) {
         try { 
           // Remove listener to prevent auto-advancing when manually stopped
           sourceNodeRef.current.onended = null; 
           sourceNodeRef.current.stop(); 
         } catch(e){}
     }
  };

  if (!state.turns.length && !state.isGenerating) return null;

  const progress = state.turns.length > 0 ? ((state.currentTurnIndex + 1) / state.turns.length) * 100 : 0;

  return (
    <>
    {isExpanded && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] animate-in fade-in" onClick={() => setIsExpanded(false)} />
    )}

    <div 
      className={`fixed left-0 right-0 z-[70] bg-[#141414] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-all duration-500 ease-out safe-pb
        ${isExpanded ? 'top-10 bottom-0 rounded-t-2xl border-x' : 'h-20'}
      `}
      style={{ bottom: isExpanded ? '0px' : bottomOffset }}
    >
      
      {/* EXPANDED VIEW */}
      {isExpanded && (
        <div className="absolute inset-0 pt-16 pb-24 px-4 md:px-12 flex flex-col md:flex-row gap-8 overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-500">
           
           {/* Left: Transcript */}
           <div className="flex-1 overflow-y-auto pr-2" ref={scrollRef}>
              <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-serif font-bold text-white">{state.metadata?.title || "Audio Overview"}</h3>
                  <div className="flex gap-2">
                       <span className="px-2 py-1 bg-white/10 rounded text-xs font-bold text-secondary">{state.lengthPreset.toUpperCase()}</span>
                       <span className="px-2 py-1 bg-white/10 rounded text-xs font-bold text-secondary">{state.turns.length} TURNS</span>
                  </div>
              </div>
              
              <div className="space-y-4 pb-20">
                 {state.turns.map((turn, i) => {
                   const isActive = i === state.currentTurnIndex;
                   const isHost1 = turn.speaker === 'Host 1';
                   return (
                     <div 
                       id={`turn-${i}`}
                       key={turn.id} 
                       onClick={() => onJumpToSegment(i)}
                       className={`flex gap-4 p-4 rounded-xl transition-all cursor-pointer border ${
                           isActive 
                             ? 'bg-white/10 border-accent/30 shadow-lg scale-[1.01]' 
                             : 'bg-transparent border-transparent hover:bg-white/5 opacity-60 hover:opacity-100'
                       }`}
                     >
                       <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold uppercase shadow-inner
                           ${isHost1 ? 'bg-indigo-500/20 text-indigo-300' : 'bg-teal-500/20 text-teal-300'}
                       `}>
                           {isHost1 ? 'AT' : 'NO'}
                       </div>
                       <div>
                           <div className="flex items-center gap-2 mb-1">
                               <span className={`text-xs font-bold uppercase tracking-wider ${isHost1 ? 'text-indigo-400' : 'text-teal-400'}`}>
                                   {isHost1 ? 'Atlas' : 'Nova'}
                               </span>
                               {turn.topic && <span className="text-[10px] text-gray-500">• {turn.topic}</span>}
                           </div>
                           <p className={`text-base leading-relaxed ${isActive ? 'text-white' : 'text-gray-300'}`}>
                               {turn.text}
                           </p>
                       </div>
                     </div>
                   );
                 })}
                 {state.isGenerating && (
                     <div className="flex items-center justify-center py-8 gap-2 text-secondary opacity-50">
                         <Loader2 className="animate-spin" size={16} />
                         <span className="text-xs font-medium uppercase tracking-widest">Writing script...</span>
                     </div>
                 )}
              </div>
           </div>

           {/* Right: Actions */}
           <div className="w-full md:w-80 shrink-0 space-y-4">
               <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                   <h4 className="text-sm font-bold text-white mb-4">Deepen Learning</h4>
                   <div className="space-y-3">
                       <button onClick={() => { onAction('teach', currentTurn?.topic); setIsExpanded(false); }} className="w-full p-3 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg flex items-center gap-3 transition border border-teal-500/20">
                           <GraduationCap size={18} />
                           <span className="text-sm font-medium">Teach me this concept</span>
                       </button>
                       <button onClick={() => { onAction('study_guide'); setIsExpanded(false); }} className="w-full p-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center gap-3 transition border border-indigo-500/20">
                           <BookOpen size={18} />
                           <span className="text-sm font-medium">Create Study Guide</span>
                       </button>
                   </div>
               </div>
           </div>
        </div>
      )}

      {/* MINI PLAYER BAR */}
      <div 
        className="absolute top-0 left-0 right-0 h-20 px-4 md:px-8 flex items-center justify-between gap-6 cursor-pointer hover:bg-white/5 transition"
        onClick={(e) => { 
           if((e.target as HTMLElement).closest('button')) return;
           setIsExpanded(!isExpanded); 
        }}
      >
          {/* Progress Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/5">
             <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex items-center gap-4 flex-1 overflow-hidden">
             <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg relative overflow-hidden group">
                 {state.isGenerating && !currentTurn ? <Loader2 className="animate-spin text-white" size={20} /> : <ListMusic className="text-white" size={20} />}
                 {isPlaying && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
             </div>
             <div className="min-w-0 flex-1">
                 <h4 className="text-sm font-bold text-white truncate">
                    {state.metadata?.title || "Generating Audio Overview..."}
                 </h4>
                 <div className="flex items-center gap-2 text-xs text-secondary truncate">
                    {state.isGenerating && !currentTurn ? 
                      <span className="animate-pulse">Analyzing sources & structuring conversation...</span> : 
                      <>
                        <span className={`font-bold ${currentTurn?.speaker === 'Host 1' ? 'text-indigo-400' : 'text-teal-400'}`}>
                            {currentTurn?.speaker === 'Host 1' ? 'Atlas' : 'Nova'}
                        </span>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-400 truncate max-w-[200px]">{currentTurn?.text}</span>
                      </>
                    }
                 </div>
             </div>
          </div>

          <div className="flex items-center gap-4">
              <button 
                onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
                disabled={state.isGenerating && !currentTurn}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition disabled:opacity-50 shadow-lg"
              >
                {isBuffering ? <Loader2 className="animate-spin" size={20} /> : state.isPlaying ? <Pause size={20} fill="black"/> : <Play size={20} fill="black" className="ml-1" />}
              </button>
              
              <button 
                 onClick={() => setIsExpanded(!isExpanded)}
                 className="p-2 hover:bg-white/10 rounded-full text-secondary hover:text-white transition hidden md:block"
              >
                  {isExpanded ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
              </button>
              
              {!isExpanded && (
                  <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-2 hover:bg-white/10 rounded-full text-secondary hover:text-white transition">
                      <X size={20} />
                  </button>
              )}
          </div>
      </div>
    </div>
    </>
  );
};