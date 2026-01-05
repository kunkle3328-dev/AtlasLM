import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Activity, Loader2, Volume2, Settings2 } from 'lucide-react';
import { LiveClient, LiveStatus } from '../services/live-client';

interface Props {
  client: LiveClient;
  isConnected: boolean;
  status: LiveStatus;
  onDisconnect: () => void;
  volumeInput: number;
}

export const LiveVoicePanel: React.FC<Props> = ({ client, isConnected, status, onDisconnect, volumeInput }) => {
  const [transcript, setTranscript] = useState<string[]>([]);
  
  useEffect(() => {
      client.onTranscript = (text, isUser) => {
          setTranscript(prev => [...prev.slice(-4), (isUser ? "You: " : "Atlas: ") + text]);
      };
  }, [client]);

  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex flex-col items-center justify-center z-[100] animate-in fade-in duration-300">
       {/* Background Ambient Effect */}
       <div className={`absolute w-96 h-96 bg-accent/10 rounded-full blur-[100px] transition-all duration-700 ${volumeInput > 10 ? 'scale-125 opacity-30' : 'scale-100 opacity-10'}`} />

       {/* Status Header */}
       <div className="absolute top-8 left-0 right-0 flex flex-col items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-widest border ${
             status === 'connected' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
             status === 'connecting' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 
             'bg-red-500/10 text-red-500 border-red-500/20'
          }`}>
             {status === 'connected' ? 'Live Session Active' : status}
          </div>
          <p className="text-secondary text-xs">Gemini 2.5 Flash Native Audio • Low Latency</p>
       </div>

       {/* Main Visualizer */}
       <div className="relative z-10 flex flex-col items-center gap-8">
           {/* Orb */}
           <div className={`
              w-40 h-40 rounded-full border-4 flex items-center justify-center transition-all duration-100 shadow-[0_0_50px_rgba(59,130,246,0.2)]
              ${status === 'connected' ? 'border-accent shadow-accent/20' : 'border-gray-700'}
           `}>
               {status === 'connecting' ? (
                   <Loader2 className="animate-spin text-white w-12 h-12" />
               ) : (
                   <div 
                     className="w-full h-full rounded-full bg-accent/20 transition-transform duration-75"
                     style={{ transform: `scale(${0.8 + Math.min(volumeInput / 50, 0.4)})` }}
                   >
                     {/* Inner Core */}
                     <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-accent to-purple-500 opacity-80" />
                   </div>
               )}
           </div>

           {/* Transcript Snippets */}
           <div className="h-24 w-80 text-center space-y-2 overflow-hidden flex flex-col justify-end">
               {transcript.map((line, i) => (
                   <p key={i} className={`text-sm ${line.startsWith("You") ? 'text-gray-500' : 'text-white font-medium'} animate-in slide-in-from-bottom-2 fade-in`}>
                       {line}
                   </p>
               ))}
               {transcript.length === 0 && status === 'connected' && (
                   <p className="text-secondary text-sm italic animate-pulse">Listening...</p>
               )}
           </div>

           {/* Controls */}
           <div className="flex items-center gap-6">
               <button className="p-4 rounded-full bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition">
                   <MicOff size={24} />
               </button>
               
               <button 
                 onClick={onDisconnect}
                 className="w-16 h-16 rounded-full bg-red-500/20 text-red-500 border border-red-500/50 flex items-center justify-center hover:bg-red-500 hover:text-white transition shadow-lg shadow-red-900/20 scale-110"
               >
                   <PhoneOff size={32} />
               </button>

               <button className="p-4 rounded-full bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition">
                   <Settings2 size={24} />
               </button>
           </div>
       </div>

       {/* Hints */}
       <div className="absolute bottom-8 text-center space-y-1">
           <p className="text-xs text-gray-600">Interrupt anytime (Barge-in enabled)</p>
           <p className="text-[10px] text-gray-700">Audio is grounded in your sources</p>
       </div>
    </div>
  );
};