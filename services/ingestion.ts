import { Source, Chunk, IngestStatus } from '../types';

declare const pdfjsLib: any;

type ProgressCallback = (update: Partial<Source>) => void;

export class IngestionService {
  
  /**
   * Helper to simulate a progress stage with smooth interpolation.
   */
  private static async runStage(
    startProgress: number,
    endProgress: number,
    durationMs: number,
    status: IngestStatus,
    label: string,
    callback: ProgressCallback
  ) {
    // Immediate update at start of stage
    callback({ status, stageLabel: label, ingestProgress: startProgress });
    
    // Smooth interpolation steps (10 steps)
    const steps = 10;
    const interval = durationMs / steps;
    const increment = (endProgress - startProgress) / steps;
    
    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, interval));
      const current = Math.min(startProgress + (increment * i), endProgress);
      // Ensure we don't overshoot 99% until explicitly ready
      const cappedCurrent = Math.min(current, 99);
      callback({ ingestProgress: Math.round(cappedCurrent) });
    }
  }

  static async processFile(file: File, notebookId: string, onUpdate: ProgressCallback): Promise<{ source: Source, chunks: Chunk[] }> {
    const sourceId = crypto.randomUUID();
    let content = "";
    
    // Initial State: Queued (handled by App.tsx optimistic UI, but reinforced here)
    onUpdate({ status: 'queued', stageLabel: 'Queued', ingestProgress: 0 });

    try {
      // 1. Uploading (0-25%)
      // Simulate network upload
      await this.runStage(1, 25, 800, 'uploading', 'Uploading file...', onUpdate);

      // 2. Parsing (25-40%)
      if (file.type === 'application/pdf') {
        onUpdate({ status: 'parsing', stageLabel: 'Parsing PDF structure...' });
        content = await this.extractPdfText(file, (pct) => {
           // Map 0-100 PDF progress to 25-40 total progress
           const mapped = 25 + (pct * 0.15);
           onUpdate({ ingestProgress: Math.round(mapped) });
        });
      } else {
        await this.runStage(25, 40, 500, 'parsing', 'Reading text content...', onUpdate);
        content = await file.text();
      }
      
      // Sanitize
      content = content.replace(/\s+/g, ' ').trim();
      const charsCount = content.length;

      // 3. Extracting / Cleaning (40-55%)
      await this.runStage(40, 55, 600, 'extracting', 'Cleaning & normalizing...', onUpdate);

      // 4. Chunking (55-70%)
      await this.runStage(55, 70, 800, 'chunking', 'Splitting into chunks...', onUpdate);
      const chunks = this.chunkText(content, sourceId, notebookId);

      // 5. Embedding (70-90%)
      await this.runStage(70, 90, 1200, 'embedding', 'Generating vector embeddings...', onUpdate);

      // 6. Indexing (90-99%)
      await this.runStage(90, 99, 500, 'indexing', 'Updating search index...', onUpdate);

      // 7. Ready
      const finalSource: Source = {
        id: sourceId, 
        notebookId,
        title: file.name,
        type: file.type === 'application/pdf' ? 'pdf' : 'text',
        content,
        createdAt: Date.now(),
        isActive: true,
        status: 'ready',
        ingestProgress: 100,
        stageLabel: 'Ready',
        stats: {
          charsCount,
          chunksCount: chunks.length,
          embeddingModel: 'Titan Embeddings v2 (Simulated)'
        },
        metadata: { description: `${Math.ceil(charsCount / 1024)}kb text extracted` }
      };
      
      onUpdate(finalSource);
      return { source: finalSource, chunks };

    } catch (e: any) {
      console.error("Ingestion error:", e);
      const failedUpdate: Partial<Source> = {
        status: 'failed',
        ingestProgress: 0,
        stageLabel: 'Failed',
        error: { message: e.message || 'Error processing file', retryable: true }
      };
      onUpdate(failedUpdate);
      throw e;
    }
  }

  static async processUrl(url: string, notebookId: string, onUpdate: ProgressCallback): Promise<{ source: Source, chunks: Chunk[] }> {
    const sourceId = crypto.randomUUID();
    
    onUpdate({ status: 'queued', stageLabel: 'Queued', ingestProgress: 0 });
    
    try {
        // 1. Fetching (0-25%)
        await this.runStage(1, 25, 1200, 'fetching', 'Fetching URL content...', onUpdate);

        // Simulate Content Download
        const content = `[Extracted Content from ${url}]\n\n` + 
        "AtlasLM is designed to be a privacy-first, source-grounded research assistant. " +
        "It uses Retrieval Augmented Generation (RAG) to ensure accuracy. " + 
        "Unlike generic models, it refuses to answer if the data isn't in your sources. " +
        "This is a simulated scrape of the website provided.";
        
        // 2. Parsing (25-40%)
        await this.runStage(25, 40, 600, 'parsing', 'Parsing HTML DOM...', onUpdate);

        // 3. Extracting (40-55%)
        await this.runStage(40, 55, 500, 'extracting', 'Extracting main article...', onUpdate);

        // 4. Chunking (55-70%)
        await this.runStage(55, 70, 700, 'chunking', 'Creating knowledge chunks...', onUpdate);
        const chunks = this.chunkText(content, sourceId, notebookId);

        // 5. Embedding (70-90%)
        await this.runStage(70, 90, 1000, 'embedding', 'Generating vector embeddings...', onUpdate);

        // 6. Indexing (90-99%)
        await this.runStage(90, 99, 500, 'indexing', 'Updating vector index...', onUpdate);

        // 7. Ready
        const finalSource: Source = {
            id: sourceId,
            notebookId,
            title: new URL(url).hostname,
            type: url.includes('youtube.com') || url.includes('youtu.be') ? 'youtube' : 'url',
            content,
            originalUrl: url,
            createdAt: Date.now(),
            isActive: true,
            status: 'ready',
            ingestProgress: 100,
            stageLabel: 'Ready',
            stats: {
                charsCount: content.length,
                chunksCount: chunks.length
            }
        };

        onUpdate(finalSource);
        return { source: finalSource, chunks };

    } catch (e: any) {
        console.error("URL processing error:", e);
        const failedUpdate: Partial<Source> = {
            status: 'failed',
            ingestProgress: 0,
            stageLabel: 'Failed',
            error: { message: e.message || 'Network error fetching URL', retryable: true }
        };
        onUpdate(failedUpdate);
        throw e;
    }
  }

  private static async extractPdfText(file: File, onProgress: (pct: number) => void): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Guard against missing library
      if (typeof pdfjsLib === 'undefined') {
          throw new Error("PDF Library not loaded");
      }
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `[Page ${i}] ${pageText}\n\n`;
        
        // Report progress
        onProgress((i / pdf.numPages) * 100);
        // Small delay to allow UI to breathe
        await new Promise(r => setTimeout(r, 50));
      }
      return fullText;
    } catch (e) {
      console.error("PDF Extraction failed", e);
      throw new Error("Failed to parse PDF file. It might be encrypted or corrupted.");
    }
  }

  private static chunkText(text: string, sourceId: string, notebookId: string): Chunk[] {
    const CHUNK_SIZE = 800;
    const OVERLAP = 100;
    const chunks: Chunk[] = [];
    
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      const chunkText = text.substring(start, end);
      
      chunks.push({
        id: crypto.randomUUID(),
        sourceId,
        notebookId,
        text: chunkText,
        startOffset: start,
        endOffset: end
      });

      start += (CHUNK_SIZE - OVERLAP);
    }
    return chunks;
  }
}