/* ────────────────────────────────────────────────────────────
 * TEXT-TO-SPEECH ("read it out loud")
 * Reads a piece of text with a REAL human-sounding voice: the `tts` edge
 * function (Gemini TTS, same "Aoede" voice as the live call) returns
 * 24 kHz PCM that is played gaplessly with WebAudio. Long texts are split
 * into sentence chunks — the first one small so speech starts fast — and
 * the next chunk is prefetched while the current one plays.
 * The browser's robotic speechSynthesis remains only as an offline/demo
 * FALLBACK so the listen buttons always do something.
 * start / stop only, like a voice you can interrupt.
 * ──────────────────────────────────────────────────────────── */

import { isDemoMode, supabase } from '@/lib/supabase';

const TTS_LANG_TAGS: Record<string, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  en: 'en-US',
  ar: 'ar-SA',
};

/**
 * Pick the fallback voice language. Replies are often in Moroccan Darija:
 * when the text is written mostly in ARABIC SCRIPT, read it with an Arabic
 * voice whatever the UI language; otherwise use the UI language (Darija
 * written in Latin letters reads best with the French/English voice).
 */
function speechTag(text: string, uiLang: string): string {
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (arabic > latin && arabic > 3) return 'ar-SA';
  return TTS_LANG_TAGS[uiLang] ?? 'en-US';
}

/** Strip chat tokens/markup that shouldn't be spoken (food-link tokens,
 *  bare markdown emphasis, list bullets, emojis). */
export function textForSpeech(raw: string): string {
  return raw
    .replace(/\[\[food:[a-z0-9-]+(?:\|[^\]]*)?\]\]/gi, '') // recommendation cards
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/^[\s]*[-•]\s+/gm, '') // list bullets
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '') // emojis
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Sentence chunking ──
 * Gemini-TTS generation time grows with chunk LENGTH, so chunks are kept
 * SMALL and fetched in parallel (sliding window): the first one tiny so
 * the voice starts in ~3-4 s, the next ones generating while the current
 * one plays — no silent gap mid-text. A sentence longer than a chunk
 * (rare, e.g. no punctuation) is hard-split on a word boundary. */
const FIRST_CHUNK = 120;
const NEXT_CHUNK = 300;

function chunkForTts(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  const sentences = text.split(/(?<=[.!?؟…])\s+/).filter((s) => s.trim());
  for (let s of sentences) {
    // Hard-split a monster sentence on spaces.
    while (s.length > NEXT_CHUNK) {
      const cut = s.lastIndexOf(' ', NEXT_CHUNK);
      const head = s.slice(0, cut > 100 ? cut : NEXT_CHUNK);
      if (cur) push();
      cur = head;
      push();
      s = s.slice(head.length).trim();
    }
    const limit = out.length === 0 ? FIRST_CHUNK : NEXT_CHUNK;
    if (cur && cur.length + s.length + 1 > limit) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return out;
}

/* ── Chunk audio cache ──
 * Replaying the same lab script / chat answer must not re-bill Gemini.
 * Keyed per chunk so a partial listen still warms the next full one. */
const ttsCache = new Map<string, { audio: string; rate: number }>();
const TTS_CACHE_MAX = 24;

async function fetchTtsChunk(
  text: string,
  language: string
): Promise<{ audio: string; rate: number } | null> {
  const key = `${language}|${text}`;
  const hit = ttsCache.get(key);
  if (hit) return hit;
  try {
    const { data, error } = await supabase!.functions.invoke('tts', {
      body: { text, language },
    });
    if (error || data?.error) return null;
    const audio = data?.result?.audio;
    if (typeof audio !== 'string' || !audio) return null;
    const entry = {
      audio,
      rate: Number(data?.result?.sampleRate) || 24000,
    };
    ttsCache.set(key, entry);
    if (ttsCache.size > TTS_CACHE_MAX) {
      ttsCache.delete(ttsCache.keys().next().value!);
    }
    return entry;
  } catch {
    return null;
  }
}

export class Speaker {
  private speaking = false;
  /** Bumped on stop()/new speak(): cancels in-flight fetch loops. */
  private session = 0;
  private ctx: AudioContext | null = null;
  private live = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  /** True once the fetch loop delivered its last chunk to the scheduler. */
  private doneFeeding = true;
  /** True once any audio actually started for the current speak(). */
  private audioStarted = false;
  /** True when the current speak() runs on the fallback engine. */
  private usingSynth = false;
  /** Fired when speech ends by itself or on stop(). */
  onEnd: (() => void) | null = null;
  /** Fired when audio actually starts playing (after the first fetch). */
  onStart: (() => void) | null = null;

  get isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as any;
    return !!(w.AudioContext || w.webkitAudioContext || w.speechSynthesis);
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * Create/resume the AudioContext. MUST run synchronously inside the tap
   * handler (iOS unlocks audio only in a user gesture) — speak() does it,
   * but callers that await something between the tap and speak() (labs
   * generates the script first) should call warm() at the top of the tap.
   */
  warm() {
    if (typeof window === 'undefined') return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AC();
    this.ctx!.resume().catch(() => {});
  }

  speak(text: string, language: string) {
    if (!this.isSupported) return;
    this.stopInternal(false);
    const clean = textForSpeech(text);
    if (!clean) return;
    this.warm();

    const session = ++this.session;
    this.speaking = true;
    this.audioStarted = false;
    this.usingSynth = false;

    // Natural Gemini voice; robotic engine only when it can't work.
    if (isDemoMode || !supabase || !this.ctx) {
      this.speakWithSynth(clean, language, session);
      return;
    }
    this.speakNatural(clean, language, session)
      .then((ok) => {
        if (!ok && this.session === session) {
          // First chunk failed (offline / function down) → fallback voice.
          this.speakWithSynth(clean, language, session);
        }
      })
      .catch(() => {
        // ANY unexpected pipeline error must never end in silence.
        if (this.session === session) this.failoverToSynth(clean, language);
      });
    // Watchdog: whatever happens, the patient must HEAR something within
    // 15 s of the tap — if the natural voice hasn't started by then
    // (mobile network + TTS generation too slow, hung request…), switch
    // to the fallback engine.
    setTimeout(() => {
      if (
        this.session === session &&
        this.speaking &&
        !this.audioStarted &&
        !this.usingSynth
      ) {
        this.failoverToSynth(clean, language);
      }
    }, 15000);
  }

  stop() {
    this.stopInternal(true);
  }

  /* ── Natural voice (Gemini TTS via the `tts` edge function) ── */

  /** Resolves false only when NOTHING could be played (caller falls back). */
  private async speakNatural(
    clean: string,
    language: string,
    session: number
  ): Promise<boolean> {
    const chunks = chunkForTts(clean);
    if (!chunks.length) {
      this.finish(session);
      return true;
    }
    this.doneFeeding = false;
    // Sliding window of 2 requests in flight: the tiny first chunk starts
    // fast while the second already generates; each play-out kicks the
    // fetch after next, so audio never has to wait on a cold request.
    const fetches: (Promise<{ audio: string; rate: number } | null> | null)[] =
      new Array(chunks.length).fill(null);
    const kick = (i: number) => {
      if (i < chunks.length && !fetches[i]) {
        fetches[i] = fetchTtsChunk(chunks[i], language);
      }
    };
    kick(0);
    kick(1);
    for (let i = 0; i < chunks.length; i++) {
      const entry = await fetches[i];
      if (this.session !== session) return true; // stopped meanwhile
      if (!entry) {
        if (i === 0) {
          this.doneFeeding = true;
          return false;
        }
        break; // mid-way failure: end gracefully with what played
      }
      kick(i + 1);
      kick(i + 2);
      this.schedule(entry, session, i === 0);
    }
    this.doneFeeding = true;
    if (this.live.size === 0) this.finish(session);
    return true;
  }

  /** base64 16-bit mono PCM → scheduled gapless AudioBufferSource. */
  private schedule(
    entry: { audio: string; rate: number },
    session: number,
    first: boolean
  ) {
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const bin = atob(entry.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    if (!i16.length) return;
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    const buf = ctx.createBuffer(1, f32.length, entry.rate);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    // Tiny lead on a fresh queue; back-to-back otherwise. When a chunk
    // arrives late the queue simply restarts from "now" — the gap falls on
    // a sentence boundary, which sounds like a natural pause.
    const at = Math.max(ctx.currentTime + (this.live.size ? 0.02 : 0.12), this.nextTime);
    src.start(at);
    this.nextTime = at + buf.duration;
    this.live.add(src);
    src.onended = () => {
      this.live.delete(src);
      if (this.live.size === 0 && this.doneFeeding) this.finish(session);
    };
    if (first) {
      this.audioStarted = true;
      this.onStart?.();
    }
  }

  /** Natural pipeline died (error or too slow): make SURE the patient
   *  still hears the text with the fallback engine. */
  private failoverToSynth(clean: string, language: string) {
    this.session++;
    for (const s of this.live) {
      try {
        s.stop();
      } catch {}
    }
    this.live.clear();
    this.nextTime = 0;
    this.doneFeeding = true;
    this.speaking = true;
    this.speakWithSynth(clean, language, this.session);
  }

  private finish(session: number) {
    if (this.session !== session || !this.speaking) return;
    this.speaking = false;
    this.onEnd?.();
  }

  /* ── Fallback: browser speechSynthesis (offline / demo) ── */

  private speakWithSynth(clean: string, language: string, session: number) {
    this.usingSynth = true;
    const synth =
      typeof window !== 'undefined' ? (window as any).speechSynthesis : null;
    if (!synth) {
      this.finish(session);
      return;
    }
    synth.cancel();
    const tag = speechTag(clean, language);
    let voice: SpeechSynthesisVoice | null = null;
    try {
      const voices = synth.getVoices() as SpeechSynthesisVoice[];
      voice =
        voices.find((v) => v.lang === tag) ??
        voices.find((v) => v.lang.startsWith(tag.split('-')[0])) ??
        null;
    } catch {}
    // Split on sentence ends; one giant utterance gets cut off by some
    // engines, so we queue readable chunks.
    const sentences = clean.split(/(?<=[.!?؟])\s+/).filter((s) => s.trim());
    if (!sentences.length) {
      this.finish(session);
      return;
    }
    sentences.forEach((sentence, i) => {
      const u = new (window as any).SpeechSynthesisUtterance(sentence);
      u.lang = tag;
      if (voice) u.voice = voice;
      u.rate = 0.98;
      u.pitch = 1;
      if (i === 0) {
        u.onstart = () => {
          if (this.session === session) {
            this.audioStarted = true;
            this.onStart?.();
          }
        };
      }
      if (i === sentences.length - 1) {
        u.onend = () => this.finish(session);
      }
      u.onerror = () => {
        // A cancelled queue fires error on pending utterances — only the
        // final state matters.
        if (i === sentences.length - 1) this.finish(session);
      };
      synth.speak(u);
    });
    // Chrome (esp. Android) can leave the engine stuck "paused" after a
    // cancel() — a queued utterance then never speaks. Kick it.
    try {
      synth.resume();
    } catch {}
  }

  /* ── Teardown shared by stop() and a new speak() ── */

  private stopInternal(fireEnd: boolean) {
    this.session++;
    const wasSpeaking = this.speaking;
    this.speaking = false;
    this.doneFeeding = true;
    for (const s of this.live) {
      try {
        s.stop();
      } catch {}
    }
    this.live.clear();
    this.nextTime = 0;
    try {
      if (typeof window !== 'undefined') {
        (window as any).speechSynthesis?.cancel();
      }
    } catch {}
    if (fireEnd && wasSpeaking) this.onEnd?.();
  }
}
