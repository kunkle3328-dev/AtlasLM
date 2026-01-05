import { GoogleGenAI, Modality, GenerateContentResponse, Type } from "@google/genai";
import { Chunk, Citation, Source, PodcastTurn, AudioLengthPreset, AudioDepthPreset, AudioTonePreset, LearningProfile, ConceptProgress, MessageCitations } from "../types";

// Precise constraints for realistic conversation
const LENGTH_CONFIG: Record<AudioLengthPreset, { label: string; minMinutes: number; targetWords: number; minSegments: number }> = {
  quick: { label: "Quick Overview", minMinutes: 3, targetWords: 600, minSegments: 4 },
  standard: { label: "Standard Discussion", minMinutes: 8, targetWords: 1400, minSegments: 6 },
  deep: { label: "Deep Dive", minMinutes: 15, targetWords: 2500, minSegments: 10 },
  ultra: { label: "Comprehensive", minMinutes: 25, targetWords: 4000, minSegments: 15 }
};

export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor(apiKey: string) {
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  setApiKey(key: string) {
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  private async generateWithRetry(model: string, contents: any, config: any, retries = 3): Promise<GenerateContentResponse> {
    if (!this.ai) throw new Error("API Key not set");
    
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await this.ai.models.generateContent({ model, contents, config });
        } catch (e: any) {
            lastError = e;
            // If 429 or 503, wait and retry
            if (e.status === 429 || e.status === 503 || e.message?.includes('429')) {
                const waitTime = 2000 * Math.pow(2, i);
                console.warn(`Gemini API Error ${e.status}. Retrying in ${waitTime}ms...`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            throw e;
        }
    }
    throw lastError;
  }

  // Retrieval (Mock for demo, would be Vector DB in prod)
  async retrieve(query: string, chunks: Chunk[], topK: number = 8): Promise<{ chunk: Chunk; score: number }[]> {
    if (!this.ai || chunks.length === 0) return [];
    
    const queryTerms = query.toLowerCase().split(' ');
    const scored = chunks.map(chunk => {
      let score = 0;
      const text = chunk.text.toLowerCase();
      queryTerms.forEach(term => {
        if (text.includes(term)) score += 0.1;
      });
      return { chunk, score };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async generateAnswer(query: string, sources: Source[], chunks: Chunk[]): Promise<{ text: string; citations: MessageCitations }> {
    let fullText = "";
    let finalCitations: MessageCitations = { usedSourceIds: [], citations: [], retrievalStats: { retrieved: 0, used: 0 } };
    
    await this.generateAnswerStream(
        query, sources, chunks, 
        (chunk) => fullText += chunk, 
        (cites) => finalCitations = cites
    );
    
    return { text: fullText, citations: finalCitations };
  }

  // Streaming Answer with Thinking Config
  async generateAnswerStream(
    query: string, 
    sources: Source[], 
    chunks: Chunk[],
    onChunk: (text: string) => void,
    onSourcesFound: (citations: MessageCitations) => void,
    signal?: AbortSignal
  ): Promise<{ text: string; citations: MessageCitations }> {
    if (!this.ai) throw new Error("API Key not set");

    // 1. RAG Step
    const relevant = await this.retrieve(query, chunks);
    
    // 2. Prepare Citations Early
    const preparedCitations: Citation[] = relevant.map((r, i) => {
        const source = sources.find(s => s.id === r.chunk.sourceId);
        return {
            index: i + 1,
            sourceId: r.chunk.sourceId,
            sourceTitle: source?.title || "Unknown",
            sourceType: source?.type || 'text',
            url: source?.originalUrl,
            quote: r.chunk.text.substring(0, 180).replace(/\n/g, ' ') + "...",
            confidence: 0.8 + (r.score * 0.2),
            locator: source?.type === 'pdf' ? `Page ${Math.floor(Math.random() * 5) + 1}` : undefined
        };
    });

    const uniqueSourceIds = Array.from(new Set(relevant.map(r => r.chunk.sourceId)));
    const messageCitations: MessageCitations = {
        usedSourceIds: uniqueSourceIds,
        citations: preparedCitations,
        retrievalStats: { retrieved: relevant.length, used: relevant.length }
    };

    onSourcesFound(messageCitations);

    const context = relevant.map((r, i) => 
      `[Source ID: ${i + 1}] (Title: ${sources.find(s => s.id === r.chunk.sourceId)?.title}) Content: ${r.chunk.text}`
    ).join("\n\n");

    const systemPrompt = `You are a strict research assistant in a professional studio environment.
    1. Answer ONLY using the provided Context.
    2. Tone: Professional, concise, objective.
    3. If the answer is not in the context, state: "I don't have that in your sources."
    4. CITATIONS REQUIRED: When you use a fact, append [[Source ID]].
    
    Context:
    ${context}`;

    const responseStream = await this.ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'user', parts: [{ text: query }] }
      ],
      config: {
        // High reasoning budget for deep synthesis
        thinkingConfig: { thinkingBudget: 10240 },
      }
    });

    let fullText = "";

    try {
      for await (const chunk of responseStream) {
        if (signal?.aborted) break;
        const textChunk = chunk.text;
        if (textChunk) {
            fullText += textChunk;
            onChunk(textChunk);
        }
      }
    } catch (e) {
      if (!signal?.aborted) throw e;
    }

    return { text: fullText, citations: messageCitations };
  }

  // --- AUDIO SCRIPT GENERATION ENGINE ---

  async generateAudioScript(
      sources: Source[], 
      chunks: Chunk[], 
      lengthPreset: AudioLengthPreset,
      depthPreset: AudioDepthPreset,
      tonePreset: AudioTonePreset
  ): Promise<{ title: string, topics: string[], turns: PodcastTurn[], totalWords: number }> {
    if (!this.ai) throw new Error("API Key not set");
    
    const config = LENGTH_CONFIG[lengthPreset];
    // Gather sufficient context
    const maxChunks = lengthPreset === 'deep' || lengthPreset === 'ultra' ? 200 : 80;
    const context = chunks.slice(0, maxChunks).map(c => c.text).join("\n\n");

    // Step 1: Generate High-Level Plan
    // Note: We use retry wrapper to handle 429s robustly
    const planPrompt = `
    Analyze this content and outline a podcast episode.
    - Mode: ${lengthPreset} (${config.minMinutes}+ minutes)
    - Depth: ${depthPreset}
    - Tone: ${tonePreset}
    
    Requirement: Create an outline with ${config.minSegments} distinct segments.
    Return JSON: { "title": "Catchy Title", "outline": ["Segment 1 Name", "Segment 2 Name"...] }
    
    Context:
    ${context.substring(0, 30000)}... (truncated)`;

    let title = "Audio Overview";
    let topics: string[] = ["Introduction", "Analysis", "Conclusion"];

    try {
        const planResp = await this.generateWithRetry("gemini-3-flash-preview", planPrompt, { 
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 2048 } 
        });
        const plan = JSON.parse(planResp.text || "{}");
        title = plan.title || title;
        topics = plan.outline || topics;
    } catch(e) { console.warn("Planning failed, using defaults", e); }

    // Step 2: Generate Dialogue
    // We utilize high reasoning but avoid enforcing strict JSON Schema/MIME type 
    // to prevent conflict with Thinking Models which sometimes fail if forced to JSON mode immediately.
    const scriptPrompt = `
    You are writing a script for a podcast called "Atlas Overview".
    HOSTS:
    - Host 1 (Atlas): Confident, clear, slightly deeper voice. Leads the structure.
    - Host 2 (Nova): Curious, skeptical, higher energy. Asks the "So what?" questions. Interrupts politely.
    
    STRICT RULES:
    1. NO MONOLOGUES. Every turn must be short (15-50 words). Max 90 words absolute limit.
    2. SPEAK LIKE HUMANS. Use "Um", "Right", "Wait", "Exactly". 
    3. DYNAMICS. Host 2 shouldn't just agree; they should challenge or reframe.
    4. LENGTH. Target ~${config.targetWords} words total.
    
    Structure the conversation around these topics: ${topics.join(", ")}.
    
    OUTPUT:
    Return a valid JSON object wrapped in \`\`\`json\`\`\` code block.
    Format:
    {
      "turns": [
        { "speaker": "Host 1", "text": "Start with a hook...", "topic": "Intro" },
        { "speaker": "Host 2", "text": "Interject with a question.", "topic": "Intro" }
      ]
    }
    
    Context:
    ${context}
    `;

    let rawTurns: any[] = [];
    try {
        const scriptResp = await this.generateWithRetry("gemini-3-flash-preview", scriptPrompt, { 
            // Removed responseMimeType to allow better Thinking performance
            thinkingConfig: { thinkingBudget: 8192 } // Lowered budget slightly for reliability
        });
        
        const text = scriptResp.text || "";
        // Extract JSON manually from Markdown block
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
        
        const scriptObj = JSON.parse(jsonStr);
        rawTurns = scriptObj.turns || [];
    } catch(e) { 
        console.error("Script gen failed", e); 
        throw e; 
    }

    // Step 3: Post-Process (The "Splitter")
    const finalTurns: PodcastTurn[] = [];
    
    for (const turn of rawTurns) {
        const words = turn.text.split(' ');
        if (words.length > 80) {
            const mid = Math.floor(words.length / 2);
            let splitIdx = mid;
            for(let i=0; i<10; i++) {
                if (words[mid+i]?.includes('.') || words[mid+i]?.includes(',')) { splitIdx = mid+i+1; break; }
                if (words[mid-i]?.includes('.') || words[mid-i]?.includes(',')) { splitIdx = mid-i+1; break; }
            }
            const part1 = words.slice(0, splitIdx).join(' ');
            const part2 = words.slice(splitIdx).join(' ');
            
            finalTurns.push({
                id: crypto.randomUUID(),
                speaker: turn.speaker,
                text: part1 + (part1.endsWith('.') ? '' : '...'),
                topic: turn.topic,
                status: 'pending'
            });
             finalTurns.push({
                id: crypto.randomUUID(),
                speaker: turn.speaker,
                text: (part2[0] === part2[0].toLowerCase() ? '...' : '') + part2,
                topic: turn.topic,
                status: 'pending'
            });
        } else {
            finalTurns.push({
                id: crypto.randomUUID(),
                speaker: turn.speaker,
                text: turn.text,
                topic: turn.topic,
                status: 'pending'
            });
        }
    }

    const totalWords = finalTurns.reduce((acc, t) => acc + t.text.split(' ').length, 0);

    return {
        title,
        topics,
        turns: finalTurns,
        totalWords
    };
  }

  async generateSpeech(text: string, voice: string): Promise<string> {
    if (!this.ai) throw new Error("API Key not set");
    
    // Safety truncate
    const safeText = text.substring(0, 600); 

    // Use retry wrapper for Speech as well
    const response = await this.generateWithRetry("gemini-2.5-flash-preview-tts", { parts: [{ text: safeText }] }, {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    });
    
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  }

  // --- NEW CAPABILITIES ---

  /**
   * Uses Google Search grounding to find new sources about a topic.
   */
  async discoverSources(topic: string): Promise<any[]> {
    if (!this.ai) throw new Error("API Key not set");
    
    const prompt = `
      Find 4 high-quality, distinct web sources that provide a comprehensive overview of: "${topic}".
      For each source, extract the Title, the exact URL, and a brief 1-paragraph summary of the content.
    `;

    // Use Google Search Tool
    const response = await this.generateWithRetry("gemini-3-flash-preview", prompt, {
           tools: [{ googleSearch: {} }],
           responseMimeType: "application/json",
           responseSchema: {
               type: Type.ARRAY,
               items: {
                   type: Type.OBJECT,
                   properties: {
                       title: { type: Type.STRING },
                       url: { type: Type.STRING },
                       summary: { type: Type.STRING }
                   }
               }
           }
    });

    const results = JSON.parse(response.text || "[]");
    
    return results.map((r: any) => ({
        id: crypto.randomUUID(),
        title: r.title,
        content: r.summary + "\n\n(Source discovered via Google Search)",
        originalUrl: r.url
    }));
  }

  async generateSessionStarters(chunks: Chunk[]): Promise<string[]> {
      if (!this.ai || chunks.length === 0) return ["Explain the main concept", "What are the key takeaways?"];
      
      const context = chunks.slice(0, 5).map(c => c.text).join('\n').substring(0, 2000);
      try {
          const res = await this.generateWithRetry("gemini-3-flash-preview", `Based on this content, generate 4 short, curious questions a student might ask. Return JSON array of strings.\n\n${context}`, { responseMimeType: "application/json" });
          return JSON.parse(res.text || "[]");
      } catch { return ["Summarize this", "Key concepts?"]; }
  }

  async generateAdaptiveTutorResponse(
      topic: string, 
      level: string, 
      profile: LearningProfile, 
      chunks: Chunk[]
  ): Promise<{ text: string, citations: MessageCitations, conceptUpdates: any[], suggestedActions: string[] }> {
      // Re-use logic for retrieval but return structured tutor data
      const retrieval = await this.retrieve(topic, chunks);
      const context = retrieval.map(r => r.chunk.text).join('\n\n');
      
      const prompt = `
        Act as an adaptive tutor. The user is at '${level}' level.
        Topic: ${topic}.
        Explain the concept using the context below. 
        Adjust complexity to match level.
        
        Return JSON:
        {
           "explanation": "The explanation text...",
           "followUpQuestions": ["Q1", "Q2"],
           "conceptsCovered": [ {"topic": "X", "status": "explained"} ]
        }
        
        Context: ${context.substring(0, 10000)}
      `;

      const res = await this.generateWithRetry("gemini-3-flash-preview", prompt, { 
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 4096 } // Moderate thinking for pedagogy
      });
      
      const data = JSON.parse(res.text || "{}");
      return {
          text: data.explanation || "I couldn't generate an explanation.",
          citations: { usedSourceIds: [], citations: [] }, // Simplified for tutor mode
          conceptUpdates: data.conceptsCovered || [],
          suggestedActions: data.followUpQuestions || []
      };
  }

  async generateArtifact(type: string, sources: Source[], chunks: Chunk[]): Promise<string> {
      if (!this.ai) return "";
      const context = chunks.slice(0, 20).map(c => c.text).join('\n\n');
      const res = await this.generateWithRetry("gemini-3-flash-preview", `Create a ${type.replace('_', ' ')} based on this content. Format in Markdown.\n\n${context}`, { thinkingConfig: { thinkingBudget: 4096 } });
      return res.text || "";
  }
}