import { AppState, Notebook, Source, Chunk, ChatMessage, StudioArtifact } from '../types';

const STORAGE_KEY = 'atlaslm_db_v1';

export class StorageService {
  static loadState(): Partial<AppState> {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to load state", e);
    }
    return {};
  }

  static saveState(state: AppState) {
    try {
      // Don't save transient UI states like audioBase64 to save space
      const persistentState = {
        ...state,
        audio: { 
            ...state.audio, 
            isPlaying: false, 
            isGenerating: false,
            // STRIP BINARY DATA: Iterate through turns and remove the base64 string
            turns: state.audio.turns.map(t => ({
                ...t,
                audioBase64: undefined 
            }))
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentState));
    } catch (e) {
      console.error("Failed to save state", e);
    }
  }

  static createNotebook(name: string): Notebook {
    return {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
}