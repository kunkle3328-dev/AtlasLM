// Utilities for handling Raw PCM Audio for Gemini Live API

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private analyzer: AnalyserNode | null = null;
  
  private nextStartTime: number = 0;
  private isProcessingInput: boolean = false;
  
  // VAD State
  private vadThreshold: number = 0.01; // Adjustable sensitivity
  private silenceCounter: number = 0;
  private speakingCounter: number = 0;
  private isVoiceDetected: boolean = false;

  public onInputData: (base64: string) => void = () => {};
  public onVolumeChange: (vol: number) => void = () => {};
  public onVadStateChange: (isSpeaking: boolean) => void = () => {};

  constructor() {
    // Lazy init
  }

  async startInput(stream: MediaStream) {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.inputSource = this.audioContext.createMediaStreamSource(stream);
    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 256;
    
    // We use ScriptProcessor for wide compatibility with raw PCM extraction 
    // In production, AudioWorklet is preferred but requires a separate file/url.
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.inputSource.connect(this.analyzer);
    this.inputSource.connect(this.processor);
    this.processor.connect(this.audioContext.destination); // Required for script processor to run

    this.processor.onaudioprocess = (e) => {
      if (!this.isProcessingInput) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      // VAD & Volume Calculation
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.onVolumeChange(rms * 10); // Scale up for UI

      // Simple VAD logic
      if (rms > this.vadThreshold) {
        this.speakingCounter++;
        this.silenceCounter = 0;
        if (this.speakingCounter > 2 && !this.isVoiceDetected) {
            this.isVoiceDetected = true;
            this.onVadStateChange(true);
        }
      } else {
        this.silenceCounter++;
        this.speakingCounter = 0;
        if (this.silenceCounter > 20 && this.isVoiceDetected) { // ~2 seconds of silence
            this.isVoiceDetected = false;
            this.onVadStateChange(false);
        }
      }

      // Convert to PCM16 and stream
      const pcm16 = this.floatTo16BitPCM(inputData);
      const base64 = this.arrayBufferToBase64(pcm16);
      this.onInputData(base64);
    };

    this.isProcessingInput = true;
  }

  stopInput() {
    this.isProcessingInput = false;
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // Playback Context (Separate to avoid sample rate mismatches if needed, but usually can share)
  private playbackContext: AudioContext | null = null;
  private playbackGain: GainNode | null = null;

  initPlayback() {
    this.playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.playbackGain = this.playbackContext.createGain();
    this.playbackGain.connect(this.playbackContext.destination);
    this.nextStartTime = this.playbackContext.currentTime;
  }

  playAudioChunk(base64Audio: string) {
    if (!this.playbackContext || !this.playbackGain) this.initPlayback();
    if (!this.playbackContext) return; // safety

    const arrayBuffer = this.base64ToArrayBuffer(base64Audio);
    const float32Data = this.pcm16ToFloat32(arrayBuffer);
    
    const buffer = this.playbackContext.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = this.playbackContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playbackGain!);

    // Schedule seamlessly
    const currentTime = this.playbackContext.currentTime;
    if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
    }
    
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  interrupt() {
    // Hard stop playback
    if (this.playbackContext) {
        this.playbackContext.close();
        this.playbackContext = null;
        this.playbackGain = null;
        this.nextStartTime = 0;
        // Re-init immediately for next turn
        this.initPlayback();
    }
  }

  // --- Helpers ---

  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private pcm16ToFloat32(buffer: ArrayBuffer): Float32Array {
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }
}