import { AudioStreamer } from './audio-streamer';

const HOST = 'generativelanguage.googleapis.com';
const VERSION = 'v1alpha';
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-09-2025';

export type LiveStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Tool {
  name: string;
  func: (args: any) => Promise<any>;
}

export class LiveClient {
  private ws: WebSocket | null = null;
  public audioStreamer: AudioStreamer;
  
  public status: LiveStatus = 'disconnected';
  public onStatusChange: (status: LiveStatus) => void = () => {};
  public onTranscript: (text: string, isUser: boolean) => void = () => {};
  
  private registeredTools: Map<string, Tool> = new Map();

  constructor() {
    this.audioStreamer = new AudioStreamer();
    
    // Wire up audio streamer events
    this.audioStreamer.onInputData = (base64) => {
      this.sendRealtimeInput(base64);
    };
    
    this.audioStreamer.onVadStateChange = (isSpeaking) => {
        if (isSpeaking) {
            // Barge-in: User started speaking, interrupt model
            this.sendInput( { interrupted: true } ); // Logic signal if needed?
            // Actually, just local interrupt is usually enough for audio, 
            // but sending empty audio or specific signal helps model stop.
            this.audioStreamer.interrupt();
        }
    };
  }

  async connect(apiKey: string, systemInstruction: string) {
    if (this.ws) {
        this.disconnect();
    }

    this.status = 'connecting';
    this.onStatusChange('connecting');

    const uri = `wss://${HOST}/ws/${VERSION}/${MODEL}?key=${apiKey}`;
    
    try {
        this.ws = new WebSocket(uri);
    } catch (e) {
        console.error("WebSocket init failed", e);
        this.status = 'error';
        this.onStatusChange('error');
        return;
    }

    this.ws.onopen = () => {
        this.status = 'connected';
        this.onStatusChange('connected');
        this.setupSession(systemInstruction);
        this.startAudio();
    };

    this.ws.onmessage = async (event) => {
        let data: any;
        if (event.data instanceof Blob) {
             data = JSON.parse(await event.data.text());
        } else {
             data = JSON.parse(event.data);
        }
        this.handleMessage(data);
    };

    this.ws.onerror = (e) => {
        console.error("Live Client Error", e);
        this.status = 'error';
        this.onStatusChange('error');
        this.disconnect();
    };

    this.ws.onclose = () => {
        this.status = 'disconnected';
        this.onStatusChange('disconnected');
        this.audioStreamer.stopInput();
    };
  }

  disconnect() {
    if (this.ws) {
        this.ws.close();
        this.ws = null;
    }
    this.audioStreamer.stopInput();
    this.audioStreamer.interrupt();
    this.status = 'disconnected';
    this.onStatusChange('disconnected');
  }

  registerTool(name: string, func: (args: any) => Promise<any>) {
    this.registeredTools.set(name, { name, func });
  }

  private setupSession(systemInstruction: string) {
    // Initial Setup Message
    const setupMsg = {
        setup: {
            model: MODEL,
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
                }
            },
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            tools: [
                {
                    functionDeclarations: [
                        {
                            name: "search_sources",
                            description: "Search the user's uploaded sources (PDFs, docs) for information to answer their question.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    query: { type: "STRING", description: "The search query related to the user's question." }
                                },
                                required: ["query"]
                            }
                        }
                    ]
                }
            ]
        }
    };
    this.send(setupMsg);
  }

  private async startAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
        } });
        this.audioStreamer.startInput(stream);
        this.audioStreamer.initPlayback();
    } catch (e) {
        console.error("Mic access denied", e);
        this.status = 'error';
        this.onStatusChange('error');
    }
  }

  private sendRealtimeInput(base64Audio: string) {
    const msg = {
        realtimeInput: {
            mediaChunks: [{
                mimeType: "audio/pcm;rate=16000",
                data: base64Audio
            }]
        }
    };
    this.send(msg);
  }

  private send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
    }
  }

  private sendInput(data: any) {
    // Wrapper for client_content or other signals if needed
    // Usually realtimeInput covers it
  }

  private async handleMessage(msg: any) {
    // 1. Audio Output
    if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                this.audioStreamer.playAudioChunk(part.inlineData.data);
            }
        }
    }

    // 2. Turn Complete (Transcription usually comes here or in continuous updates?)
    // Note: In WebSocket API, we might not get transcript unless we asked for it in modality?
    // Actually, turnComplete often has it if configured? 
    // The prompt requested pure Audio modality. We rely on logs or client tool context for "transcript" visual if available.
    // Wait, the API doesn't send transcript if modality is AUDIO only. 
    // We will rely on the Tool Call logging to show "Thinking..." and the audio for the answer.

    // 3. Tool Calls
    if (msg.toolCall) {
        this.handleToolCall(msg.toolCall);
    }
  }

  private async handleToolCall(toolCall: any) {
      for (const fc of toolCall.functionCalls) {
          const tool = this.registeredTools.get(fc.name);
          if (tool) {
              console.log(`[LiveClient] Calling tool: ${fc.name}`, fc.args);
              // Provide visual feedback via transcript callback
              this.onTranscript(`Searching sources for: "${fc.args.query}"...`, false);
              
              const result = await tool.func(fc.args);
              
              // Send response back
              const toolResponse = {
                  toolResponse: {
                      functionResponses: [
                          {
                              name: fc.name,
                              id: fc.id,
                              response: { result: result }
                          }
                      ]
                  }
              };
              this.send(toolResponse);
          } else {
              console.warn(`Unknown tool: ${fc.name}`);
          }
      }
  }
}