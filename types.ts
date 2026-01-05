export type SourceType = 'text' | 'url' | 'youtube' | 'pdf' | 'audio';

export type IngestStatus = 
  | 'queued' 
  | 'fetching' 
  | 'uploading' 
  | 'parsing' 
  | 'extracting' 
  | 'chunking' 
  | 'embedding' 
  | 'indexing' 
  | 'ready' 
  | 'failed' 
  | 'canceled';

export interface Source {
  id: string;
  notebookId: string;
  title: string;
  type: SourceType;
  content: string;
  originalUrl?: string;
  createdAt: number;
  isActive: boolean; 
  
  // Ingestion State
  status: IngestStatus;
  ingestProgress: number; // 0-100
  stageLabel: string;
  
  error?: {
    message: string;
    retryable: boolean;
  };
  
  stats?: {
    charsCount?: number;
    chunksCount?: number;
    embeddingModel?: string;
  };

  metadata?: {
    pageCount?: number;
    author?: string;
    description?: string;
  };
}

export interface Notebook {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Chunk {
  id: string;
  sourceId: string;
  notebookId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  embedding?: number[]; 
}

export interface Citation {
  sourceId: string;
  sourceTitle: string;
  sourceType: SourceType;
  url?: string;
  quote: string; // short excerpt
  startIndex?: number; // legacy
  endIndex?: number; // legacy
  index: number; // 1-based index for UI [1]
  confidence: number; // 0-1
  locator?: string; // e.g. "Page 5" or "02:30"
}

export interface MessageCitations {
  usedSourceIds: string[];
  citations: Citation[];
  retrievalStats?: {
    retrieved: number;
    used: number;
  };
}

export interface ChatMessage {
  id: string;
  notebookId: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isVoiceTurn?: boolean; 
  suggestedActions?: string[];
  
  // Rich Attribution
  citations?: MessageCitations;
  
  // Streaming & UI State
  isStreaming?: boolean; // Is text currently arriving?
  isThinking?: boolean; // Are we in the pre-token phase?
  thinkingPhase?: string; // e.g., "Reviewing sources...", "Drafting..."
  status?: 'complete' | 'stopped' | 'error';
}

export type ArtifactType = 
  'study_guide' | 'faq' | 'timeline' | 'briefing' | 'glossary' | 
  'flashcards' | 'quiz' | 'audio_overview' | 'summary' | 'takeaways';

export interface StudioArtifact {
  id: string;
  notebookId: string;
  type: ArtifactType;
  title: string;
  content: string; 
  origin: 'audio' | 'teach' | 'chat' | 'manual'; 
  createdAt: number;
}

// --- AUDIO TYPES UPGRADE ---

export interface PodcastTurn {
  id: string;
  speaker: 'Host 1' | 'Host 2';
  text: string;
  topic?: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
  audioBase64?: string;
  durationMs?: number;
}

export type ConceptStatus = 'discovered' | 'explained' | 'applied' | 'mastered';

export interface ConceptProgress {
  topic: string;
  status: ConceptStatus;
  confidence: number; // 0-1
  lastInteraction: number;
  sourceOrigins: string[]; 
}

export interface LearningProfile {
  concepts: ConceptProgress[];
  overallLevel: 'beginner' | 'intermediate' | 'advanced';
}

export type AudioLengthPreset = 'quick' | 'standard' | 'deep' | 'ultra';
export type AudioDepthPreset = 'overview' | 'practical' | 'expert';
export type AudioTonePreset = 'neutral' | 'teacher' | 'analyst' | 'conversational';

export interface AudioOverviewState {
  isGenerating: boolean;
  isPlaying: boolean;
  
  // New granular structure
  turns: PodcastTurn[];
  
  metadata: {
    title?: string;
    topics?: string[];
    durationLabel?: string;
    totalWords?: number;
    estDurationSec?: number;
  } | null;
  
  currentTurnIndex: number;
  notebookId: string | null;
  lengthPreset: AudioLengthPreset;
  depthPreset: AudioDepthPreset;
  tonePreset: AudioTonePreset;
}

export type TeachLevel = 'beginner' | 'intermediate' | 'advanced';
export interface TeachState {
    isActive: boolean;
    currentTopic: string;
    level: TeachLevel;
    messages: ChatMessage[];
}

export interface AppState {
  apiKey: string;
  activeNotebookId: string | null;
  notebooks: Notebook[];
  sources: Source[]; 
  chunks: Chunk[];
  chatHistory: ChatMessage[]; 
  artifacts: StudioArtifact[]; 
  learningProfile: LearningProfile; 
  activeTab: 'sources' | 'chat' | 'audio' | 'teach' | 'studio'; 
  isProcessingSource: boolean; // Global loading state (optional, can derive from sources)
  showSettings: boolean;
  audio: AudioOverviewState;
  teach: TeachState;
  liveMode: {
    isEnabled: boolean;
    isConnected: boolean;
    isListening: boolean;
    isSpeaking: boolean;
    volumeInput: number;
    volumeOutput: number;
    transcript: string;
  }
}