/* ────────────────────────────────────────────────────────────────
 * Gemini Live API — real-time voice engine (web only).
 *
 * A true phone-call experience: the microphone streams 16 kHz PCM to
 * Gemini over a WebSocket, Gemini streams 24 kHz PCM speech back, and
 * automatic voice-activity detection lets the patient interrupt the AI
 * mid-sentence (barge-in) exactly like a human call.
 *
 * Auth: short-lived ephemeral tokens minted by the `live-token` edge
 * function — the real GEMINI_API_KEY never reaches the browser.
 * ──────────────────────────────────────────────────────────────── */

import { isDemoMode, supabase } from '@/lib/supabase';

/* Ephemeral tokens use the CONSTRAINED bidi method (verified live) —
 * plain API keys would use BidiGenerateContent instead. */
const LIVE_HOST_CONSTRAINED =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
const LIVE_HOST_KEY =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

/** The call runs on the dedicated Live model (verified working Jul 2026);
 *  chat and the food scanner stay on gemini-2.5-flash — regular models
 *  can't do real-time audio, and live models aren't for text/vision. */
export const LIVE_MODELS = ['gemini-3.1-flash-live-preview'];

/** BCP-47 speech tags per app language. */
export const LIVE_LANG_TAGS: Record<string, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  en: 'en-US',
  ar: 'ar-XA',
};

/** Fetch an ephemeral Live token from the edge function. */
export async function getLiveToken(): Promise<string | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('live-token', {
      body: {},
    });
    if (error || !data?.token) return null;
    return data.token as string;
  } catch {
    return null;
  }
}

export interface LiveFunctionCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LiveEvents {
  /** Model audio chunk arrived (playback should begin/continue). */
  onAudio: (base64Pcm24k: string) => void;
  /** Rolling transcription of what the model is saying (per turn). */
  onText?: (text: string) => void;
  /** Transcription chunk of what the PATIENT is saying (input audio).
   *  Used to detect goodbyes client-side so the call always hangs up. */
  onUserText?: (text: string) => void;
  /** The user talked over the model — clear the playback queue. */
  onInterrupted?: () => void;
  /** Model finished its spoken turn. */
  onTurnComplete?: () => void;
  /** The model invoked one of the declared tools (e.g. log_insulin). */
  onToolCall?: (calls: LiveFunctionCall[]) => void;
  /** Connection dropped / errored after setup. */
  onClose?: () => void;
}

/** One Live WebSocket session. connect() resolves once setup completes. */
export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private ready = false;
  private closedByUs = false;
  private turnText = '';
  /** Exact token totals accumulated from the API's usageMetadata. */
  private usageTotals = { textIn: 0, audioIn: 0, textOut: 0, audioOut: 0 };
  private pendingUsage: any = null;

  constructor(private events: LiveEvents) {}

  /** Fold the latest per-turn usageMetadata into the session totals.
   *  The API may resend (growing) usage during a turn — we always keep the
   *  last snapshot and commit it once per turn (turnComplete/interrupted). */
  private commitUsage() {
    const um = this.pendingUsage;
    this.pendingUsage = null;
    if (!um) return;
    const byModality = (details: any[] | undefined, modality: string) =>
      (details ?? [])
        .filter((d) => d?.modality === modality)
        .reduce((a, d) => a + (d.tokenCount ?? 0), 0);
    const audioIn = byModality(um.promptTokensDetails, 'AUDIO');
    const audioOut = byModality(um.responseTokensDetails, 'AUDIO');
    this.usageTotals.audioIn += audioIn;
    this.usageTotals.textIn += Math.max(0, (um.promptTokenCount ?? 0) - audioIn);
    this.usageTotals.audioOut += audioOut;
    this.usageTotals.textOut += Math.max(0, (um.responseTokenCount ?? 0) - audioOut);
  }

  /** Exact tokens used this session (call after hang-up). */
  getUsageTotals() {
    this.commitUsage(); // count an unfinished last turn too
    return { ...this.usageTotals };
  }

  connect(
    token: string,
    model: string,
    systemInstruction: string,
    /** Omit to let the model speak WHATEVER language it answers in —
     *  required for automatic dialect matching (Darija ↔ French ↔ …).
     *  Forcing a BCP-47 tag here locks the voice to that language. */
    languageCode?: string,
    timeoutMs = 8000,
    /** Optional function declarations (Live API tools / function calling). */
    tools?: unknown[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (why: string) => {
        if (!settled) {
          settled = true;
          reject(new Error(why));
        }
      };
      const timer = setTimeout(() => {
        try {
          this.ws?.close();
        } catch {}
        fail('timeout');
      }, timeoutMs);

      // NOTE: the token must be passed RAW (its slash unencoded) — verified.
      const url = token.startsWith('auth_tokens/')
        ? `${LIVE_HOST_CONSTRAINED}?access_token=${token}`
        : `${LIVE_HOST_KEY}?key=${token}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  ...(languageCode ? { languageCode } : {}),
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
                },
                // Verified: accepted by the live model, keeps replies snappy
                // (~570 ms to first audio) even on longer questions.
                thinkingConfig: { thinkingBudget: 0 },
              },
              systemInstruction: { parts: [{ text: systemInstruction }] },
              outputAudioTranscription: {},
              inputAudioTranscription: {},
              ...(tools && tools.length ? { tools } : {}),
            },
          })
        );
      };

      ws.onmessage = async (evt) => {
        let msg: any;
        try {
          const raw =
            typeof evt.data === 'string' ? evt.data : await (evt.data as Blob).text();
          msg = JSON.parse(raw);
        } catch {
          return;
        }

        if (msg.setupComplete !== undefined) {
          this.ready = true;
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        if (msg.usageMetadata) this.pendingUsage = msg.usageMetadata;

        // Function calling: the model wants the app to log something.
        const calls = msg.toolCall?.functionCalls;
        if (Array.isArray(calls) && calls.length) {
          this.events.onToolCall?.(
            calls.map((c: any) => ({
              id: c.id,
              name: String(c.name ?? ''),
              args: c.args ?? {},
            }))
          );
          return;
        }

        const sc = msg.serverContent;
        if (!sc) return;
        const ut = sc.inputTranscription?.text;
        if (ut) this.events.onUserText?.(ut);
        if (sc.interrupted) {
          this.turnText = '';
          this.commitUsage();
          this.events.onInterrupted?.();
          return;
        }
        const parts = sc.modelTurn?.parts ?? [];
        for (const p of parts) {
          const data = p.inlineData?.data;
          if (data) this.events.onAudio(data);
        }
        const t = sc.outputTranscription?.text;
        if (t) {
          this.turnText += t;
          this.events.onText?.(this.turnText);
        }
        if (sc.turnComplete) {
          this.turnText = '';
          this.commitUsage();
          this.events.onTurnComplete?.();
        }
      };

      ws.onerror = () => {
        clearTimeout(timer);
        if (!settled) fail('ws error');
        else if (!this.closedByUs) this.events.onClose?.();
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) fail('ws closed');
        else if (!this.closedByUs) this.events.onClose?.();
      };
    });
  }

  /** Stream one base64 chunk of 16 kHz 16-bit mono PCM from the mic.
   *  (Field name `audio` verified end-to-end: model heard speech and
   *  answered with voice. VAD needs the silence the mic naturally sends
   *  after the user stops talking.) */
  sendAudio(base64Pcm16k: string) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: { mimeType: 'audio/pcm;rate=16000', data: base64Pcm16k },
        },
      })
    );
  }

  /** Send a text turn. Used to make the model speak FIRST — right after the
   *  call connects we push a short directive so it greets the patient by name
   *  before they say anything. */
  sendText(text: string) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true,
        },
      })
    );
  }

  /** Answer a toolCall so the model can confirm out loud to the patient. */
  sendToolResponse(
    responses: { id?: string; name: string; response: Record<string, unknown> }[]
  ) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({ toolResponse: { functionResponses: responses } })
    );
  }

  close() {
    this.closedByUs = true;
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.ready = false;
  }
}

/* ───────────────────────── Microphone ───────────────────────── */

function floatTo16BitBase64(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(i16.buffer);
  let bin = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Linear-interpolation resampler to 16 kHz (mic runs at 44.1/48 kHz). */
function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] + (input[i1] - input[i0]) * (pos - i0);
  }
  return out;
}

/** Captures the mic and emits base64 16 kHz PCM chunks (~250 ms each). */
export class MicStreamer {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private proc: ScriptProcessorNode | null = null;
  private muted = false;
  /** Fired (throttled) when the mic picks up actual speech, not just noise. */
  onSpeech: (() => void) | null = null;
  private lastSpeechEmit = 0;

  /** MUST be called synchronously inside a user gesture on iOS Safari —
   *  audio contexts created outside a tap stay suspended forever. */
  prepareContext() {
    if (this.ctx) return;
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.ctx!.resume().catch(() => {});
  }

  async start(onChunk: (b64: string) => void): Promise<void> {
    this.prepareContext();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.ctx!.resume().catch(() => {});
    const src = this.ctx!.createMediaStreamSource(this.stream);
    this.proc = this.ctx!.createScriptProcessor(4096, 1, 1);
    const rate = this.ctx!.sampleRate;
    this.proc.onaudioprocess = (e) => {
      if (this.muted) return;
      const f32 = e.inputBuffer.getChannelData(0);
      // Voice-activity detection: emit onSpeech only when the frame carries
      // real energy (speech ≫ background), throttled to once per ~500 ms.
      // Used by the caller to reset the silence-hangup countdown.
      if (this.onSpeech) {
        let sum = 0;
        for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
        const rms = Math.sqrt(sum / f32.length);
        const nowMs = Date.now();
        if (rms > 0.02 && nowMs - this.lastSpeechEmit > 500) {
          this.lastSpeechEmit = nowMs;
          this.onSpeech();
        }
      }
      onChunk(floatTo16BitBase64(downsampleTo16k(f32, rate)));
    };
    src.connect(this.proc);
    // ScriptProcessor only fires when connected to a destination; route it
    // through a zero-gain node so the mic isn't echoed to the speakers.
    const silent = this.ctx!.createGain();
    silent.gain.value = 0;
    this.proc.connect(silent);
    silent.connect(this.ctx!.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  resume() {
    this.ctx?.resume().catch(() => {});
  }

  stop() {
    try {
      this.proc?.disconnect();
    } catch {}
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      this.ctx?.close();
    } catch {}
    this.proc = null;
    this.stream = null;
    this.ctx = null;
  }
}

/* ───────────────────────── Speaker ───────────────────────── */

/** Plays a stream of base64 24 kHz PCM chunks gaplessly; supports barge-in. */
export class PcmPlayer {
  private ctx: AudioContext;
  private gain: GainNode;
  private nextTime = 0;
  private live = new Set<AudioBufferSourceNode>();
  /** Called when the playback queue fully drains. */
  onDrain?: () => void;

  constructor() {
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    // No forced sampleRate: iOS Safari can refuse non-native rates. The
    // buffers are created at 24 kHz and WebAudio resamples automatically.
    this.ctx = new AC();
    this.ctx.resume().catch(() => {});
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  play(base64Pcm24k: string) {
    const bin = atob(base64Pcm24k);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(bytes.buffer);
    if (i16.length === 0) return;
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

    const buf = this.ctx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    // Jitter buffer: when the queue is empty (start of a turn, or after an
    // under-run) give the network a ~150 ms head start before playing, so
    // the first words of the AI never stutter. Mid-stream chunks keep the
    // tight 20 ms scheduling for gapless playback.
    const lead = this.live.size === 0 ? 0.15 : 0.02;
    const at = Math.max(this.ctx.currentTime + lead, this.nextTime);
    src.start(at);
    this.nextTime = at + buf.duration;
    this.live.add(src);
    src.onended = () => {
      this.live.delete(src);
      if (this.live.size === 0) this.onDrain?.();
    };
  }

  isPlaying(): boolean {
    return this.live.size > 0;
  }

  /** Barge-in: kill everything scheduled right now. */
  clear() {
    for (const s of this.live) {
      try {
        s.stop();
      } catch {}
    }
    this.live.clear();
    this.nextTime = 0;
  }

  setMuted(m: boolean) {
    this.gain.gain.value = m ? 0 : 1;
  }

  resume() {
    this.ctx.resume().catch(() => {});
  }

  close() {
    this.clear();
    try {
      this.ctx.close();
    } catch {}
  }
}
