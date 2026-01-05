import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Layers, Settings, MessageSquare, Layout, 
  BookOpen, Clock, FileText, Send, ChevronRight, 
  MoreHorizontal, Trash2, Mic, Search, Globe, 
  CheckCircle, ArrowLeft, BrainCircuit, Headphones,
  GraduationCap, Sparkles, PlayCircle, BarChart2,
  List, X, Menu, Lightbulb, Play, Pause, Bookmark,
  Loader2, SlidersHorizontal, ChevronDown, ChevronUp,
  Maximize2, Minimize2, AlertCircle
} from 'lucide-react';
import { marked } from 'marked';

import { AppState, Source, ChatMessage, StudioArtifact, PodcastTurn, AudioDepthPreset, AudioTonePreset, LearningProfile, MessageCitations } from './types';
import { GeminiService } from './services/gemini';
import { IngestionService } from './services/ingestion';
import { StorageService } from './services/storage';
import { LiveClient } from './services/live-client';

import { SettingsModal } from './components/SettingsModal';
import { AudioPlayer } from './components/AudioPlayer';
import { SourceViewer } from './components/SourceViewer';
import { LiveVoicePanel } from './components/LiveVoicePanel';
import { SourceRow } from './components/SourceRow';
import { SourceDetailsSheet } from './components/SourceDetailsSheet';
import { MessageBubble } from './components/MessageBubble';
import { CitationSheet } from './components/CitationSheet';

const App: React.FC = () => {
  // --- Global State ---
  const [state, setState] = useState<AppState>(() => {
    const loaded = StorageService.loadState();
    if (loaded.sources) {
        loaded.sources = loaded.sources.map((s: Source) => {
            if (s.status !== 'ready' && s.status !== 'failed' && s.status !== 'canceled') {
                return {
                    ...s,
                    status: 'failed',
                    stageLabel: 'Interrupted',
                    error: { message: 'Ingestion interrupted by reload. Please retry.', retryable: true }
                };
            }
            return s;
        });
    }

    return {
      activeNotebookId: null,
      notebooks: [],
      sources: [],
      chunks: [],
      chatHistory: [],
      artifacts: [],
      learningProfile: { concepts: [], overallLevel: 'beginner' },
      activeTab: 'sources',
      isProcessingSource: false,
      showSettings: false,
      audio: {
        isGenerating: false,
        isPlaying: false,
        turns: [],
        metadata: null,
        currentTurnIndex: 0,
        notebookId: null,
        lengthPreset: 'standard',
        depthPreset: 'overview',
        tonePreset: 'conversational'
      },
      teach: {
          isActive: false,
          currentTopic: '',
          level: 'beginner',
          messages: []
      },
      liveMode: {
        isEnabled: false,
        isConnected: false,
        isListening: false,
        isSpeaking: false,
        volumeInput: 0,
        volumeOutput: 0,
        transcript: ''
      },
      ...loaded,
      apiKey: process.env.API_KEY || ''
    };
  });

  // --- Local UI State ---
  const [input, setInput] = useState('');
  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [isAddingSource, setIsAddingSource] = useState(false);
  
  // Generation Control State
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Viewing States
  const [activeSourceViewer, setActiveSourceViewer] = useState<Source | null>(null);
  const [detailsSource, setDetailsSource] = useState<Source | null>(null);
  const [viewingCitations, setViewingCitations] = useState<MessageCitations | null>(null); 
  
  const [workspaceTab, setWorkspaceTab] = useState<'audio' | 'teach' | 'chat' | 'studio'>('audio');
  
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  
  const [smartStarters, setSmartStarters] = useState<string[]>([]);

  // Services
  const geminiRef = useRef<GeminiService | null>(null);
  const liveClientRef = useRef<LiveClient | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const teachEndRef = useRef<HTMLDivElement>(null);

  // --- Effects ---
  useEffect(() => { StorageService.saveState(state); }, [state]);
  
  useEffect(() => {
    if (state.apiKey) geminiRef.current = new GeminiService(state.apiKey);
    else setState(s => ({ ...s, showSettings: true }));
  }, [state.apiKey]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [state.chatHistory, isGenerating]);
  useEffect(() => { teachEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [state.teach.messages, isGenerating]);

  useEffect(() => {
      if (state.activeNotebookId && geminiRef.current && state.chunks.length > 0) {
          const nbChunks = state.chunks.filter(c => c.notebookId === state.activeNotebookId);
          if (nbChunks.length > 0) {
              geminiRef.current.generateSessionStarters(nbChunks).then(setSmartStarters);
          }
      }
  }, [state.activeNotebookId, state.sources.length]);

  useEffect(() => {
     if (!liveClientRef.current) {
         liveClientRef.current = new LiveClient();
         liveClientRef.current.onStatusChange = (status) => setState(s => ({...s, liveMode: {...s.liveMode, isConnected: status === 'connected'}}));
         liveClientRef.current.audioStreamer.onVolumeChange = (vol) => setState(s => ({...s, liveMode: {...s.liveMode, volumeInput: vol}}));
     }
  }, []);

  // --- Logic ---
  const createNotebook = () => {
    const newNb = StorageService.createNotebook("Untitled Project " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
    setState(s => ({ ...s, notebooks: [...s.notebooks, newNb], activeNotebookId: newNb.id }));
  };

  const updateSourceState = (id: string, update: Partial<Source>) => {
      setState(s => ({
          ...s,
          sources: s.sources.map(src => src.id === id ? { ...src, ...update } : src)
      }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!state.activeNotebookId || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    
    setIsAddingSource(true);
    const tempSource: Source = {
        id: crypto.randomUUID(),
        notebookId: state.activeNotebookId,
        title: file.name,
        type: file.type === 'application/pdf' ? 'pdf' : 'text',
        content: '',
        createdAt: Date.now(),
        isActive: true,
        status: 'queued',
        ingestProgress: 0,
        stageLabel: 'Queued'
    };
    
    setState(s => ({ ...s, sources: [tempSource, ...s.sources] }));
    
    setTimeout(() => { setIsAddingSource(false); setShowAddSource(false); }, 600);

    try {
      const { source, chunks } = await IngestionService.processFile(file, state.activeNotebookId, (update) => {
          updateSourceState(tempSource.id, update);
      });
      setState(s => ({ 
          ...s, 
          sources: s.sources.map(src => src.id === tempSource.id ? source : src),
          chunks: [...s.chunks, ...chunks]
      }));
    } catch (e) { console.error(e); }
  };

  const handleUrlAdd = async () => {
    if (!state.activeNotebookId || !sourceUrl.trim()) return;
    
    setIsAddingSource(true);
    const tempSource: Source = {
        id: crypto.randomUUID(),
        notebookId: state.activeNotebookId,
        title: new URL(sourceUrl).hostname,
        type: sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be') ? 'youtube' : 'url',
        content: '',
        originalUrl: sourceUrl,
        createdAt: Date.now(),
        isActive: true,
        status: 'queued',
        ingestProgress: 0,
        stageLabel: 'Queued'
    };
    setState(s => ({ ...s, sources: [tempSource, ...s.sources] }));
    setSourceUrl(''); 
    setTimeout(() => { setIsAddingSource(false); setShowAddSource(false); }, 600);
    try {
      const { source, chunks } = await IngestionService.processUrl(sourceUrl, state.activeNotebookId, (update) => {
          updateSourceState(tempSource.id, update);
      });
      setState(s => ({ 
          ...s, 
          sources: s.sources.map(src => src.id === tempSource.id ? source : src),
          chunks: [...s.chunks, ...chunks]
      }));
    } catch (e) { console.error(e); }
  };

  const handleDiscover = async () => {
    if (!geminiRef.current) {
        alert("Please set your API Key in Settings to use Discovery.");
        setState(s => ({...s, showSettings: true}));
        return;
    }
    if (!sourceUrl.trim()) return;

    setIsAddingSource(true);
    setState(s => ({...s, isProcessingSource: true}));
    try {
        const foundSources = await geminiRef.current.discoverSources(sourceUrl);
        const sourcesWithNotebook = foundSources.map(s => ({ 
            ...s, 
            notebookId: state.activeNotebookId!,
            status: 'ready' as const, 
            ingestProgress: 100,
            stageLabel: 'Ready'
        }));
        const newChunks = sourcesWithNotebook.flatMap(s => [{ id: crypto.randomUUID(), sourceId: s.id, notebookId: s.notebookId, text: s.content, startOffset: 0, endOffset: s.content.length }]);
        setState(s => ({ ...s, sources: [...s.sources, ...sourcesWithNotebook], chunks: [...s.chunks, ...newChunks], isProcessingSource: false }));
        setSourceUrl(''); setIsAddingSource(false); setShowAddSource(false);
    } catch { setState(s => ({...s, isProcessingSource: false})); setIsAddingSource(false); }
  };

  const handleRemoveSource = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(confirm('Remove this source?')) {
          setState(s => ({ ...s, sources: s.sources.filter(src => src.id !== id), chunks: s.chunks.filter(c => c.sourceId !== id) }));
      }
  };

  const handleRetrySource = (source: Source) => {
      if (source.type === 'url' && source.originalUrl) {
          setState(s => ({ ...s, sources: s.sources.filter(src => src.id !== source.id) }));
          setSourceUrl(source.originalUrl);
          alert("Retry initiated: Please paste the URL again to confirm.");
          setShowAddSource(true); // Open panel for convenience
      } else {
          alert("Please re-upload this file to retry.");
      }
  };

  // --- Generation & Controls ---
  const stopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }
      setIsGenerating(false);
      
      // Update last message to stopped state
      if (workspaceTab === 'chat') {
          setState(s => ({
              ...s,
              chatHistory: s.chatHistory.map((msg, i) => i === s.chatHistory.length - 1 ? { ...msg, isStreaming: false, isThinking: false, status: 'stopped' } : msg)
          }));
      } else if (workspaceTab === 'teach') {
          setState(s => ({
              ...s,
              teach: {
                  ...s.teach,
                  messages: s.teach.messages.map((msg, i) => i === s.teach.messages.length - 1 ? { ...msg, isStreaming: false, isThinking: false, status: 'stopped' } : msg)
              }
          }));
      }
  };

  // ... (handleSendMessage and handleTeachMe same as before)
  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || !geminiRef.current || !state.activeNotebookId) return;
    
    // Stop any previous generation
    stopGeneration();

    const validSources = state.sources.filter(s => s.notebookId === state.activeNotebookId && s.status === 'ready');
    if (validSources.length === 0) return alert("Please wait for sources to finish processing.");

    // 1. Add User Message
    const userMsg: ChatMessage = { id: crypto.randomUUID(), notebookId: state.activeNotebookId, role: 'user', text: textToSend, timestamp: Date.now() };
    if (!textOverride) setInput('');
    
    // 2. Add Assistant Placeholder (Thinking State)
    const botMsgId = crypto.randomUUID();
    const botMsgPlaceholder: ChatMessage = { 
        id: botMsgId, 
        notebookId: state.activeNotebookId!, 
        role: 'model', 
        text: '', 
        timestamp: Date.now(),
        isThinking: true,
        thinkingPhase: 'Reviewing sources...',
        isStreaming: false
    };

    setState(s => ({ ...s, chatHistory: [...s.chatHistory, userMsg, botMsgPlaceholder] }));
    setIsGenerating(true);

    abortControllerRef.current = new AbortController();

    try {
      // 3. Start Streaming
      let accumulatedText = "";
      
      const { text, citations } = await geminiRef.current.generateAnswerStream(
          userMsg.text, 
          validSources, 
          state.chunks.filter(c => c.notebookId === state.activeNotebookId),
          (chunk) => {
              // On First Chunk: Switch from Thinking to Streaming
              accumulatedText += chunk;
              setState(s => ({
                  ...s,
                  chatHistory: s.chatHistory.map(msg => msg.id === botMsgId ? { 
                      ...msg, 
                      text: accumulatedText,
                      isThinking: false,
                      isStreaming: true 
                  } : msg)
              }));
          },
          (citations) => {
              // On Sources Found: Update citations before streaming content
              setState(s => ({
                  ...s,
                  chatHistory: s.chatHistory.map(msg => msg.id === botMsgId ? {
                      ...msg,
                      citations,
                      thinkingPhase: 'Analyzing sources...'
                  } : msg)
              }));
          },
          abortControllerRef.current.signal
      );

      // 4. Finalize
      setState(s => ({ 
          ...s, 
          chatHistory: s.chatHistory.map(msg => msg.id === botMsgId ? { 
              ...msg, 
              text: text, // ensure full text
              citations, 
              isStreaming: false, 
              isThinking: false,
              status: 'complete'
          } : msg) 
      }));

      // Auto-save insight if long
      if (text.length > 500) {
          const artifact: StudioArtifact = {
              id: crypto.randomUUID(), notebookId: state.activeNotebookId!, type: 'summary', title: `Insight: ${textToSend.substring(0, 30)}...`, content: text, origin: 'chat', createdAt: Date.now()
          };
          setState(s => ({ ...s, artifacts: [...s.artifacts, artifact] }));
      }
    } catch (e: any) { 
        if (e.name !== 'AbortError') {
             console.error(e); 
             setState(s => ({
                  ...s,
                  chatHistory: s.chatHistory.map(msg => msg.id === botMsgId ? { ...msg, isThinking: false, isStreaming: false, status: 'error', text: msg.text || "Sorry, I encountered an error." } : msg)
             }));
        }
    } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
    }
  };

  const handleTeachMe = async (topic?: string) => {
      const targetTopic = topic || input;
      if (!targetTopic || !geminiRef.current || !state.activeNotebookId) return;
      
      stopGeneration();

      if (workspaceTab !== 'teach') setWorkspaceTab('teach');
      
      const userMsg: ChatMessage = { id: crypto.randomUUID(), notebookId: state.activeNotebookId, role: 'user', text: targetTopic, timestamp: Date.now() };
      
      const botMsgId = crypto.randomUUID();
      const botMsgPlaceholder: ChatMessage = { 
          id: botMsgId, 
          notebookId: state.activeNotebookId, 
          role: 'model', 
          text: '', 
          timestamp: Date.now(),
          isThinking: true,
          thinkingPhase: 'Analyzing learning profile...',
      };

      setState(s => ({ ...s, teach: { ...s.teach, messages: [...s.teach.messages, userMsg, botMsgPlaceholder], isActive: true } }));
      if (!topic) setInput('');
      
      setIsGenerating(true);
      abortControllerRef.current = new AbortController();

      const phaseTimer = setInterval(() => {
          setState(s => ({
              ...s,
              teach: {
                  ...s.teach,
                  messages: s.teach.messages.map(msg => msg.id === botMsgId && msg.isThinking ? {
                      ...msg,
                      thinkingPhase: msg.thinkingPhase === 'Analyzing learning profile...' ? 'Structuring lesson...' : 'Drafting explanation...'
                  } : msg)
              }
          }));
      }, 2000);

      try {
          const result = await geminiRef.current.generateAdaptiveTutorResponse(
              targetTopic, state.teach.level, state.learningProfile, state.chunks.filter(c => c.notebookId === state.activeNotebookId)
          );
          
          clearInterval(phaseTimer);
          
          if (abortControllerRef.current?.signal.aborted) return;

          setState(s => {
              const newProfile = { ...s.learningProfile };
              result.conceptUpdates.forEach(update => {
                 const existingIdx = newProfile.concepts.findIndex(c => c.topic === update.topic);
                 if (existingIdx >= 0) newProfile.concepts[existingIdx] = { ...newProfile.concepts[existingIdx], ...update };
                 else newProfile.concepts.push({ topic: update.topic!, status: update.status as any || 'explained', confidence: update.confidence || 0.5, lastInteraction: Date.now(), sourceOrigins: [] });
              });
              
              return { 
                  ...s, 
                  teach: { 
                      ...s.teach, 
                      messages: s.teach.messages.map(msg => msg.id === botMsgId ? {
                          ...msg,
                          text: result.text,
                          citations: result.citations,
                          suggestedActions: result.suggestedActions,
                          isThinking: false,
                          status: 'complete'
                      } : msg) 
                  }, 
                  learningProfile: newProfile 
              };
          });
      } catch (e: any) { 
          clearInterval(phaseTimer);
          if (e.name !== 'AbortError') console.error(e); 
      } finally {
          setIsGenerating(false);
          abortControllerRef.current = null;
      }
  };

  // --- AUDIO PIPELINE UPGRADE ---

  // Queue generator: fetches audio for subsequent turns
  const processAudioQueue = async (turns: PodcastTurn[]) => {
      if (!geminiRef.current) return;

      // Start fetching audio for turns that don't have it yet
      // We do this sequentially to respect rate limits
      for (let i = 0; i < turns.length; i++) {
          
          // Only process if we need audio for this turn
          if (!turns[i].audioBase64) {
              
              let retryCount = 0;
              let success = false;
              const maxRetries = 3;

              while (!success && retryCount < maxRetries) {
                  try {
                      // Mark as generating in state
                      setState(s => ({
                          ...s,
                          audio: {
                              ...s.audio,
                              turns: s.audio.turns.map((t) => t.id === turns[i].id ? { ...t, status: 'generating' } : t)
                          }
                      }));

                      // Add a standard delay between requests to be nice to the API
                      await new Promise(r => setTimeout(r, 1500)); 

                      const voice = turns[i].speaker === 'Host 1' ? 'Fenrir' : 'Kore';
                      const audio = await geminiRef.current.generateSpeech(turns[i].text, voice);
                      
                      setState(s => ({
                          ...s,
                          audio: {
                              ...s.audio,
                              turns: s.audio.turns.map((t) => t.id === turns[i].id ? { ...t, status: 'ready', audioBase64: audio } : t)
                          }
                      }));
                      success = true;

                  } catch (e: any) {
                       const isRateLimit = e.message?.includes('429') || e.status === 429;
                       
                       if (isRateLimit) {
                           // Exponential Backoff: 5s, 10s, 15s
                           const waitTime = 5000 * (retryCount + 1);
                           console.warn(`[Audio] Rate limit 429. Pausing queue for ${waitTime}ms...`);
                           await new Promise(r => setTimeout(r, waitTime));
                           retryCount++;
                       } else {
                           console.error("Audio fetch failed for turn", i, e);
                           // Fatal error for this turn
                           setState(s => ({
                              ...s,
                              audio: {
                                  ...s.audio,
                                  turns: s.audio.turns.map((t) => t.id === turns[i].id ? { ...t, status: 'error' } : t)
                              }
                          }));
                          break; // Exit retry loop, move to next or stop? Let's move to next.
                       }
                  }
              }
          }
      }
  };

  const generateArtifact = async (type: string, fromAudioContext: boolean = false) => {
    if (!geminiRef.current || !state.activeNotebookId) return;
    
    if (type === 'audio_overview') {
        const validSources = state.sources.filter(s => s.notebookId === state.activeNotebookId && s.status === 'ready');
        if (validSources.length === 0) return alert("Please wait for sources to be ready.");
        
        setState(s => ({ ...s, audio: { ...s.audio, isGenerating: true, turns: [], metadata: null } }));
        
        try {
            const result = await geminiRef.current.generateAudioScript(
                validSources, 
                state.chunks.filter(c => c.notebookId === state.activeNotebookId),
                state.audio.lengthPreset, state.audio.depthPreset, state.audio.tonePreset
            );
            
            // Initial state with text script
            setState(s => ({ 
                ...s, 
                audio: { 
                    ...s.audio, 
                    isGenerating: false, 
                    isPlaying: true, // Start playing immediately
                    turns: result.turns, 
                    metadata: { title: result.title, topics: result.topics, totalWords: result.totalWords }, 
                    currentTurnIndex: 0 
                } 
            }));

            // Start fetching audio in background
            processAudioQueue(result.turns);

        } catch (e: any) { 
            console.error(e); 
            alert(`Failed to generate audio overview: ${e.message || e}`); // ALERT ADDED
            setState(s => ({ ...s, audio: { ...s.audio, isGenerating: false } })); 
        }
        return;
    }
    const content = await geminiRef.current.generateArtifact(type, state.sources, state.chunks);
    const artifact: StudioArtifact = { id: crypto.randomUUID(), notebookId: state.activeNotebookId, type: type as any, title: type.replace('_', ' ').toUpperCase(), content, origin: fromAudioContext ? 'audio' : 'manual', createdAt: Date.now() };
    setState(s => ({ ...s, artifacts: [...s.artifacts, artifact] }));
    if(fromAudioContext) setWorkspaceTab('studio');
  };

  const handleTurnEnd = () => {
    const nextIndex = state.audio.currentTurnIndex + 1;
    if (nextIndex < state.audio.turns.length) {
        setState(s => ({ ...s, audio: { ...s.audio, currentTurnIndex: nextIndex, isPlaying: true } }));
    } else {
        setState(s => ({ ...s, audio: { ...s.audio, isPlaying: false, currentTurnIndex: 0 } }));
    }
  };
  
  const handleJumpToTurn = (index: number) => {
      setState(s => ({ ...s, audio: { ...s.audio, currentTurnIndex: index, isPlaying: true } }));
  };
  
  // --- Render ---

  if (!state.activeNotebookId) {
    // ... (Welcome screen unchanged)
    return (
      <div className="h-screen w-full bg-background text-primary flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1a1f2e] to-background">
        <div className="max-w-md w-full text-center space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-tr from-accent to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-accent/20">
              <BrainCircuit size={48} className="text-white" />
            </div>
          </div>
          <div><h1 className="text-5xl font-serif font-bold mb-3 tracking-tight">AtlasLM Studio</h1><p className="text-secondary text-lg font-light">The next-generation workspace for deep learning.</p></div>
          <button onClick={createNotebook} className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:scale-[1.02] transform duration-200"><Plus size={20} /> Create Project</button>
          {state.notebooks.length > 0 && (
            <div className="pt-8 border-t border-white/10 text-left">
              <h3 className="text-xs font-bold text-secondary uppercase mb-4 tracking-wider">Recent Projects</h3>
              <div className="space-y-2">
                {state.notebooks.map(nb => (
                    <button key={nb.id} onClick={() => setState(s => ({...s, activeNotebookId: nb.id}))} className="w-full p-4 glass-card rounded-xl text-left flex justify-between items-center group">
                        <span className="font-medium text-white">{nb.name}</span><ChevronRight className="text-secondary group-hover:text-white" size={16} />
                    </button>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => setState(s => ({...s, showSettings: true}))} className="text-xs text-secondary hover:text-white underline pt-4">API Settings</button>
        </div>
        <SettingsModal isOpen={state.showSettings} onClose={() => setState(s => ({...s, showSettings: false}))} onSave={(k) => setState(s => ({...s, apiKey: k, showSettings: false}))} existingKey={state.apiKey} />
      </div>
    );
  }

  const currentSources = state.sources.filter(s => s.notebookId === state.activeNotebookId);
  const currentChat = state.chatHistory.filter(c => c.notebookId === state.activeNotebookId);
  const ingestingCount = currentSources.filter(s => s.status !== 'ready' && s.status !== 'failed').length;

  const hasPlayer = state.audio.turns.length > 0 || state.audio.isGenerating;
  const bottomNavHeight = "3.5rem";
  const playerHeight = "5rem"; 
  const buffer = "1rem";
  
  const mobileBottomPadding = hasPlayer
    ? `calc(${bottomNavHeight} + env(safe-area-inset-bottom) + ${playerHeight} + ${buffer})`
    : `calc(${bottomNavHeight} + env(safe-area-inset-bottom) + ${buffer})`;

  const estimatedMinutes = state.audio.metadata?.totalWords 
    ? Math.ceil(state.audio.metadata.totalWords / 150) 
    : 0;

  return (
    <div className="h-screen w-screen bg-background flex flex-col md:flex-row overflow-hidden relative font-sans text-primary">
      <SettingsModal isOpen={state.showSettings} onClose={() => setState(s => ({...s, showSettings: false}))} onSave={(k) => setState(s => ({...s, apiKey: k, showSettings: false}))} existingKey={state.apiKey} />
      {activeSourceViewer && <SourceViewer source={activeSourceViewer} onClose={() => setActiveSourceViewer(null)} />}
      {detailsSource && <SourceDetailsSheet source={detailsSource} onClose={() => setDetailsSource(null)} />}
      
      {/* Citation Sheet */}
      {viewingCitations && (
          <CitationSheet citations={viewingCitations} onClose={() => setViewingCitations(null)} />
      )}
      
      {state.liveMode.isEnabled && <LiveVoicePanel client={liveClientRef.current!} isConnected={state.liveMode.isConnected} status={liveClientRef.current?.status || 'disconnected'} volumeInput={state.liveMode.volumeInput} onDisconnect={async () => { const newEnabled = !state.liveMode.isEnabled; setState(s => ({...s, liveMode: {...s.liveMode, isEnabled: newEnabled}})); if(!newEnabled) liveClientRef.current?.disconnect(); }} />}

      {/* --- SOURCES PANE --- */}
      <div className={`
          flex-col md:w-72 border-r border-border bg-[#0B0F14] z-50 md:z-20 fixed inset-y-0 left-0 md:relative transition-transform duration-300 w-80 md:w-auto shadow-2xl md:shadow-none
          ${isSourcesOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
         {/* (Sidebar content same as before) */}
         <div className="p-4 border-b border-border flex items-center justify-between">
             <div className="flex-1 min-w-0">
                <button onClick={() => setState(s => ({...s, activeNotebookId: null}))} className="flex items-center gap-2 text-secondary hover:text-white transition mb-2">
                    <ArrowLeft size={16} /> Back
                </button>
                <h2 className="font-serif font-bold text-xl text-white truncate">{state.notebooks.find(n => n.id === state.activeNotebookId)?.name}</h2>
             </div>
             <button onClick={() => setIsSourcesOpen(false)} className="md:hidden p-2 text-secondary"><X size={20}/></button>
         </div>
         <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-secondary uppercase tracking-wider">Sources ({currentSources.length})</span>
            <button onClick={() => setShowAddSource(!showAddSource)} className="p-1.5 hover:bg-white/10 rounded-lg text-accent transition"><Plus size={16}/></button>
         </div>
         
         <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-24 md:pb-4">
             {showAddSource && (
                 <div className="p-3 bg-elevated border border-border rounded-lg animate-in fade-in zoom-in-95 space-y-3 mb-4">
                     <div className="grid grid-cols-2 gap-2">
                         <label className="cursor-pointer studio-input p-2 rounded text-center text-xs hover:bg-white/5"><input type="file" className="hidden" onChange={handleFileUpload} />Upload File</label>
                         <button onClick={handleDiscover} className="studio-input p-2 rounded text-center text-xs hover:bg-white/5">Discover</button>
                     </div>
                     <input 
                        className="w-full studio-input rounded px-3 py-2 text-xs mt-2" 
                        placeholder="Paste URL..." 
                        value={sourceUrl} 
                        onChange={(e) => setSourceUrl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                if (sourceUrl.startsWith('http')) handleUrlAdd();
                                else handleDiscover();
                            }
                        }}
                     />
                     <button 
                        onClick={() => {
                            if (sourceUrl.startsWith('http')) handleUrlAdd();
                            else handleDiscover();
                        }}
                        disabled={isAddingSource || !sourceUrl.trim()}
                        className="w-full py-1.5 bg-accent text-white rounded text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                     >
                        {isAddingSource ? <><Loader2 className="animate-spin" size={14}/> Added. Indexing...</> : 'Add Source'}
                     </button>
                 </div>
             )}
             
             {currentSources.map(s => (
                 <SourceRow 
                    key={s.id} 
                    source={s} 
                    onClick={() => {
                        if (s.status === 'ready') setActiveSourceViewer(s);
                        else setDetailsSource(s);
                    }}
                    onRetry={() => handleRetrySource(s)}
                    onRemove={(e) => handleRemoveSource(s.id, e)}
                 />
             ))}
         </div>
         <div className="p-4 border-t border-border hidden md:block">
             <button onClick={() => setState(s => ({...s, showSettings: true}))} className="flex items-center gap-2 text-xs text-secondary hover:text-white"><Settings size={14} /> Settings</button>
         </div>
      </div>
      {isSourcesOpen && <div className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setIsSourcesOpen(false)} />}


      {/* --- CENTER WORKSPACE --- */}
      <div className="flex-1 flex flex-col bg-background relative z-10 min-w-0 h-[100dvh]">
          {/* Header & Tabs */}
          <div className="h-14 border-b border-border flex items-center bg-background/80 backdrop-blur-md sticky top-0 z-30 px-0 md:px-6 justify-between md:justify-start gap-0 md:gap-6">
              {[
                  {id: 'audio', label: 'Audio', icon: Headphones},
                  {id: 'teach', label: 'Teach', icon: GraduationCap},
                  {id: 'chat', label: 'Chat', icon: MessageSquare},
                  {id: 'studio', label: 'Saved', icon: Layout},
              ].map(tab => (
                  <button 
                    key={tab.id} 
                    onClick={() => setWorkspaceTab(tab.id as any)}
                    className={`h-full flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors flex-1 md:flex-none px-2 md:px-0 ${workspaceTab === tab.id ? 'border-accent text-white' : 'border-transparent text-secondary hover:text-gray-300'}`}
                  >
                      <tab.icon size={16} /> {tab.label}
                  </button>
              ))}
          </div>

          {ingestingCount > 0 && (
             <div className="absolute top-14 left-0 right-0 z-20 bg-indigo-500/10 border-b border-indigo-500/20 px-4 py-2 flex items-center justify-center gap-3 animate-in fade-in slide-in-from-top-2 backdrop-blur-md">
                 <Loader2 className="animate-spin text-indigo-400" size={14} />
                 <span className="text-xs font-medium text-indigo-100">Indexing {ingestingCount} source{ingestingCount > 1 ? 's' : ''}...</span>
             </div>
          )}

          <div className="flex-1 overflow-y-auto relative p-6 md:p-12 no-scrollbar-on-mobile" style={{ paddingBottom: window.innerWidth <= 768 ? mobileBottomPadding : '2rem' }}>
              
              {/* AUDIO VIEW (Overhauled) */}
              {workspaceTab === 'audio' && (
                  <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-2">
                      {state.audio.turns.length > 0 || state.audio.isGenerating ? (
                          <div className="space-y-8">
                             {/* ... Audio UI ... */}
                             <div className="glass-panel p-6 md:p-8 rounded-2xl bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border-indigo-500/20 relative overflow-hidden">
                                 <div className="absolute top-0 right-0 p-32 bg-accent/10 blur-[100px] rounded-full pointer-events-none" />
                                 <div className="relative z-10">
                                     <div className="flex gap-2 mb-4">
                                         <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/10 text-white border border-white/10">{state.audio.lengthPreset}</span>
                                         <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/10 text-white border border-white/10">{state.audio.depthPreset}</span>
                                     </div>
                                     <h2 className="text-2xl md:text-4xl font-serif font-bold text-white mb-2 leading-tight">
                                        {state.audio.metadata?.title || (state.audio.isGenerating ? "Analyzing Sources..." : "Audio Overview")}
                                     </h2>
                                     <p className="text-secondary text-sm mb-6 flex items-center gap-2">Hosted by Atlas & Nova • <Clock size={14}/> ~{estimatedMinutes} min</p>
                                     <div className="flex flex-col md:flex-row gap-3">
                                         <button 
                                            onClick={() => setState(s => ({...s, audio: {...s.audio, isPlaying: !s.audio.isPlaying}}))} 
                                            disabled={state.audio.isGenerating && state.audio.turns.length === 0}
                                            className="w-full md:w-auto px-6 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                         >
                                             {state.audio.isPlaying ? <Pause size={18} fill="black"/> : <Play size={18} fill="black"/>}
                                             {state.audio.isPlaying ? "Pause" : "Play Episode"}
                                         </button>
                                         <button onClick={() => { setState(s => ({...s, audio: { ...s.audio, isPlaying: false, turns: [], currentTurnIndex: 0, metadata: null }})); }} className="w-full md:w-auto px-4 py-3 bg-white/10 text-white font-medium rounded-full hover:bg-white/20 transition">Reset</button>
                                     </div>
                                 </div>
                             </div>
                             
                             {/* Transcript placeholder - handled by Player expanded view mainly, but could show partial list here */}
                             <div className="text-center text-secondary text-sm">
                                 {state.audio.isGenerating ? (
                                     <div className="flex flex-col items-center gap-2">
                                         <Loader2 className="animate-spin text-accent" size={24} />
                                         <p>Structuring a deep dive conversation...</p>
                                     </div>
                                 ) : (
                                     <p>Open player for full transcript</p>
                                 )}
                             </div>
                          </div>
                      ) : (
                          <div className="text-center space-y-4 py-10 md:py-20">
                              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-full flex items-center justify-center border border-white/10">
                                  <Headphones size={32} className="text-accent" />
                              </div>
                              <h2 className="text-3xl font-serif font-bold text-white">Audio Overview</h2>
                              <p className="text-secondary max-w-lg mx-auto">Analyze your sources and generate a professional podcast discussion with Atlas & Nova.</p>
                              <div className="pt-4">
                                  <button onClick={() => generateArtifact('audio_overview')} disabled={state.audio.isGenerating || currentSources.length === 0} className="px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-50 flex items-center gap-2 mx-auto">
                                      {state.audio.isGenerating ? <><Loader2 className="animate-spin" size={20}/> Generating...</> : <><PlayCircle size={20}/> Generate Episode</>}
                                  </button>
                                  {ingestingCount > 0 && <p className="text-xs text-orange-400 mt-2">Wait for sources to finish indexing...</p>}
                              </div>
                          </div>
                      )}
                  </div>
              )}

              {/* TEACH VIEW */}
              {workspaceTab === 'teach' && (
                  <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in">
                       {state.teach.messages.length === 0 ? (
                           <div className="space-y-8 pt-6">
                               <div className="space-y-2">
                                   <div className="flex items-center gap-3 mb-2">
                                     <div className="w-10 h-10 bg-teal-500/10 rounded-full flex items-center justify-center">
                                         <GraduationCap size={20} className="text-teal-400" />
                                     </div>
                                     <h3 className="text-xl font-serif text-white">Continue Learning</h3>
                                   </div>
                               </div>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   {smartStarters.map((starter, i) => (
                                       <button key={i} onClick={() => handleTeachMe(starter)} className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-teal-500/30 text-left transition">
                                           <span className="text-sm font-medium text-gray-200">{starter}</span>
                                       </button>
                                   ))}
                               </div>
                           </div>
                       ) : (
                           state.teach.messages.map(msg => (
                               <MessageBubble 
                                 key={msg.id} 
                                 message={msg} 
                                 onStop={isGenerating && msg.isThinking ? stopGeneration : undefined}
                                 onViewCitations={setViewingCitations}
                               />
                           ))
                       )}
                       <div ref={teachEndRef} />
                  </div>
              )}

              {/* CHAT VIEW */}
              {workspaceTab === 'chat' && (
                  <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in">
                      {currentChat.length === 0 && (
                          <div className="pt-6">
                              <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                                    <MessageSquare size={20} className="text-white" />
                                </div>
                                <h3 className="text-xl font-serif text-white">Ask your sources</h3>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                  {["Summarize the key risks", "What is the main argument?", "Are there conflicting views?"].map(q => (
                                      <button key={q} onClick={() => handleSendMessage(q)} className="px-3 py-1.5 rounded-full border border-white/10 text-xs text-secondary hover:text-white hover:bg-white/5 transition">
                                          {q}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}
                      
                      {currentChat.map(msg => (
                          <MessageBubble 
                            key={msg.id} 
                            message={msg} 
                            onStop={isGenerating && (msg.isStreaming || msg.isThinking) ? stopGeneration : undefined}
                            onRegenerate={() => { 
                                // Simple regenerate logic: find last user message and resend
                                handleSendMessage(currentChat[currentChat.length - 2]?.text);
                            }}
                            onViewCitations={setViewingCitations}
                          />
                      ))}
                      
                      <div ref={chatEndRef} />
                  </div>
              )}

              {/* STUDIO VIEW (unchanged) */}
              {workspaceTab === 'studio' && (
                  <div className="max-w-4xl mx-auto animate-in fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {state.artifacts.filter(a => a.notebookId === state.activeNotebookId).sort((a,b) => b.createdAt - a.createdAt).map(art => (
                              <div key={art.id} className="glass-card p-6 rounded-xl hover:bg-white/5 cursor-pointer group flex flex-col h-full">
                                  <div className="flex justify-between items-start mb-4">
                                      <div className={`p-2 rounded-lg ${
                                          art.origin === 'audio' ? 'bg-indigo-500/20 text-indigo-400' : 
                                          art.origin === 'teach' ? 'bg-teal-500/20 text-teal-400' : 'bg-white/5 text-secondary'
                                      }`}>
                                          {art.origin === 'audio' ? <Headphones size={18}/> : 
                                           art.origin === 'teach' ? <GraduationCap size={18}/> : <FileText size={18}/>}
                                      </div>
                                      <span className="text-[10px] text-secondary">{new Date(art.createdAt).toLocaleDateString()}</span>
                                  </div>
                                  <h3 className="font-bold text-lg text-white mb-2 group-hover:text-accent transition">{art.title}</h3>
                                  <p className="text-sm text-secondary line-clamp-3 mb-4 flex-1">{art.content.substring(0, 150)}...</p>
                                  <div className="pt-4 border-t border-white/5 flex gap-2">
                                      <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{art.type.replace('_', ' ')}</span>
                                  </div>
                              </div>
                          ))}
                          {state.artifacts.length === 0 && <p className="text-secondary text-center col-span-2 py-20">No saved artifacts yet.</p>}
                      </div>
                  </div>
              )}
          </div>

          {/* INPUT BAR */}
          {(workspaceTab === 'chat' || workspaceTab === 'teach') && (
              <div 
                className="fixed left-0 right-0 p-4 md:px-12 pointer-events-none z-[80] md:absolute md:bottom-24"
                style={{ 
                    bottom: window.innerWidth <= 768 && hasPlayer 
                        ? `calc(${bottomNavHeight} + env(safe-area-inset-bottom) + ${playerHeight})` 
                        : `calc(${bottomNavHeight} + env(safe-area-inset-bottom))`
                }}
              >
                  <div className="max-w-3xl mx-auto glass-panel p-1.5 pl-6 rounded-full flex items-center shadow-2xl pointer-events-auto">
                      <input 
                        className="flex-1 bg-transparent border-none outline-none text-white placeholder-secondary h-10"
                        placeholder={workspaceTab === 'teach' ? "What concept should I explain?" : "Ask a question..."}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (workspaceTab === 'teach' ? handleTeachMe() : handleSendMessage())}
                        disabled={isGenerating}
                      />
                      <button onClick={async () => { const newEnabled = !state.liveMode.isEnabled; setState(s => ({...s, liveMode: {...s.liveMode, isEnabled: newEnabled}})); if(newEnabled) { if(!state.apiKey) return; liveClientRef.current?.connect(state.apiKey, "You are a helpful assistant."); } else { liveClientRef.current?.disconnect(); } }} className="p-3 text-secondary hover:text-white transition"><Headphones size={20}/></button>
                      <button 
                        onClick={() => workspaceTab === 'teach' ? handleTeachMe() : handleSendMessage()} 
                        disabled={isGenerating}
                        className={`p-3 rounded-full transition ${isGenerating ? 'bg-white/10 text-white/50 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200'}`}
                      >
                         {isGenerating ? <div className="w-4 h-4 bg-current rounded-sm animate-spin" /> : <Send size={18}/>}
                      </button>
                  </div>
              </div>
          )}
      </div>

      {/* Tools Sidebar (unchanged) */}
      <div className={`
        md:w-80 border-l border-border bg-[#0B0F14] z-[110] md:z-20
        md:relative md:flex flex-col h-full
        fixed inset-x-0 bottom-0 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-transform duration-300
        ${isToolsOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
      `}
      style={{ maxHeight: '85vh' }}
      >
          {/* ... Tools Content ... */}
          <div className="md:hidden w-12 h-1.5 bg-white/20 rounded-full mx-auto mt-3 mb-2" onClick={() => setIsToolsOpen(false)}/>

          <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-serif font-bold text-white">Controls</h3>
              <button onClick={() => setIsToolsOpen(false)} className="md:hidden p-1 text-secondary"><X size={20}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-8 safe-pb md:pb-4">
              {workspaceTab === 'audio' && (
                  <div className="space-y-6">
                      <div>
                          <label className="text-xs font-bold text-secondary uppercase mb-3 block">Length</label>
                          <div className="grid grid-cols-4 gap-1 p-1 bg-white/5 rounded-lg border border-white/5">
                              {(['quick', 'standard', 'deep', 'ultra'] as const).map(l => (
                                  <button key={l} onClick={() => setState(s => ({...s, audio: {...s.audio, lengthPreset: l}}))} className={`py-1.5 rounded text-[10px] uppercase font-bold transition ${state.audio.lengthPreset === l ? 'bg-white text-black shadow' : 'text-secondary hover:text-white'}`}>{l}</button>
                              ))}
                          </div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-secondary uppercase mb-3 block">Depth</label>
                          <div className="space-y-2">
                              {(['overview', 'practical', 'expert'] as const).map(d => (
                                  <button key={d} onClick={() => setState(s => ({...s, audio: {...s.audio, depthPreset: d}}))} className={`w-full text-left px-3 py-2 rounded border transition ${state.audio.depthPreset === d ? 'border-accent bg-accent/10 text-white' : 'border-transparent hover:bg-white/5 text-secondary'}`}>
                                      <div className="text-xs font-bold capitalize">{d}</div>
                                  </button>
                              ))}
                          </div>
                      </div>
                      <button onClick={() => { generateArtifact('audio_overview'); setIsToolsOpen(false); }} className="w-full py-2 border border-white/20 hover:bg-white/10 rounded text-xs font-bold text-white transition">Regenerate Audio</button>
                  </div>
              )}
              {workspaceTab === 'teach' && (
                   <div className="space-y-6">
                       <div>
                           <label className="text-xs font-bold text-secondary uppercase mb-3 block">Difficulty Level</label>
                           <div className="flex flex-col gap-2">
                               {(['beginner', 'intermediate', 'advanced'] as const).map(l => (
                                   <button key={l} onClick={() => setState(s => ({...s, teach: {...s.teach, level: l}}))} className={`w-full text-left px-3 py-3 rounded border transition ${state.teach.level === l ? 'border-teal-500 bg-teal-500/10 text-white' : 'border-white/5 hover:bg-white/5 text-secondary'}`}>
                                       <div className="text-xs font-bold capitalize mb-0.5">{l}</div>
                                       <div className="text-[10px] opacity-60">{l === 'beginner' ? 'Simple analogies' : l === 'intermediate' ? 'Standard terms' : 'Technical deep dive'}</div>
                                   </button>
                               ))}
                           </div>
                       </div>
                   </div>
              )}
              <div className="pt-8 border-t border-border">
                  <h4 className="text-xs font-bold text-secondary uppercase mb-4">Quick Tools</h4>
                  <div className="grid grid-cols-2 gap-2">
                      {[ {id: 'summary', label: 'Summary'}, {id: 'study_guide', label: 'Study Guide'}, {id: 'faq', label: 'FAQ'}, {id: 'timeline', label: 'Timeline'} ].map(t => (
                          <button key={t.id} onClick={() => { generateArtifact(t.id); setIsToolsOpen(false); }} className="p-2 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded text-left transition">{t.label}</button>
                      ))}
                  </div>
              </div>
          </div>
      </div>
      {isToolsOpen && <div className="md:hidden fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={() => setIsToolsOpen(false)} />}


      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#141414] border-t border-white/10 z-[100] flex justify-around items-center safe-pb h-14">
          <button onClick={() => setIsSourcesOpen(true)} className="flex flex-col items-center gap-1 p-2 text-secondary hover:text-white">
              <Layers size={20} />
              <span className="text-[10px] font-medium">Sources</span>
          </button>
          <div className="w-px h-8 bg-white/10"/>
          <button onClick={() => setIsToolsOpen(true)} className="flex flex-col items-center gap-1 p-2 text-secondary hover:text-white">
              <SlidersHorizontal size={20} />
              <span className="text-[10px] font-medium">Tools</span>
          </button>
      </div>

      <AudioPlayer 
        state={state.audio} 
        onTogglePlay={() => setState(s => ({...s, audio: {...s.audio, isPlaying: !s.audio.isPlaying}}))} 
        onClose={() => setState(s => ({...s, audio: { ...s.audio, isPlaying: false, currentTurnIndex: 0, turns: [] }}))}
        onSegmentEnd={handleTurnEnd}
        onJumpToSegment={handleJumpToTurn}
        onAction={(action, topic) => { if (action === 'teach' && topic) handleTeachMe(`Teach me about ${topic}`); else generateArtifact(action, true); }}
        bottomOffset={bottomNavHeight}
      />
    </div>
  );
};

export default App;