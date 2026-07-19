/* ────────────────────────────────────────────────────────────
 * TEXT-TO-SPEECH ("read it out loud")
 * Reads a piece of text with a REAL human-sounding voice: the `tts` edge
 * function (Gemini TTS, same "Aoede" voice as the live call) returns
 * 24 kHz PCM. Each chunk is wrapped in a WAV header and played through a
 * pair of <audio> elements (unlocked inside the tap gesture, then
 * ping-ponged) instead of WebAudio: media elements keep playing when an
 * iPhone's ring/silent switch is off — WebAudio is hard-muted there, which
 * used to look like "speaking" with zero sound — and their timeupdate /
 * ended / error events tell the TRUTH about whether sound is coming out,
 * so the UI and the fallback watchdog can never be fooled by a source
 * that was scheduled but never audible.
 * Long texts are split into sentence chunks — the first one small so
 * speech starts fast — and the next chunk is prefetched while the current
 * one plays. A chunk that fails (Gemini rate-limit 502s happen on long
 * texts) is retried; if it still fails mid-text the REST of the text is
 * read by the browser's speechSynthesis rather than silently dropped.
 * The robotic speechSynthesis also remains the offline/demo FALLBACK so
 * the listen buttons always produce sound.
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch one chunk of natural speech. Gemini's TTS model rate-limits under
 * load (the edge function surfaces that as an error): a failed attempt is
 * retried after a pause — the wait lands on a sentence boundary, which
 * sounds like a natural breath, not a glitch.
 */
async function fetchTtsChunk(
  text: string,
  language: string,
  retries: number,
  cancelled: () => boolean
): Promise<{ audio: string; rate: number } | null> {
  const key = `${language}|${text}`;
  const hit = ttsCache.get(key);
  if (hit) return hit;
  for (let attempt = 0; ; attempt++) {
    if (cancelled()) return null;
    try {
      const { data, error } = await supabase!.functions.invoke('tts', {
        body: { text, language },
      });
      const audio = data?.result?.audio;
      if (!error && !data?.error && typeof audio === 'string' && audio) {
        const entry = {
          audio,
          rate: Number(data?.result?.sampleRate) || 24000,
        };
        ttsCache.set(key, entry);
        if (ttsCache.size > TTS_CACHE_MAX) {
          ttsCache.delete(ttsCache.keys().next().value!);
        }
        return entry;
      }
    } catch {
      // network / function error → retry below
    }
    if (attempt >= retries || cancelled()) return null;
    await sleep(1500 * (attempt + 1));
  }
}

/* ── PCM → WAV ──
 * The edge function returns raw 16-bit little-endian mono PCM; a 44-byte
 * RIFF header turns it into a WAV every <audio> element can play. */

function writeWavHeader(bytes: Uint8Array, rate: number, dataLen: number) {
  const dv = new DataView(bytes.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  dv.setUint32(40, dataLen, true);
}

/** base64 PCM → playable WAV object URL (revoked after playback). */
function pcmToWavUrl(b64: string, rate: number): string | null {
  try {
    const bin = atob(b64);
    const n = bin.length & ~1;
    if (!n) return null;
    const bytes = new Uint8Array(44 + n);
    writeWavHeader(bytes, rate, n);
    for (let i = 0; i < n; i++) bytes[44 + i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  } catch {
    return null;
  }
}

/** ~16 ms of silence, used to unlock the <audio> pool inside the tap. */
let silentWav = '';
function silentWavUri(): string {
  if (silentWav) return silentWav;
  const bytes = new Uint8Array(44 + 256);
  writeWavHeader(bytes, 8000, 256);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  silentWav = `data:audio/wav;base64,${btoa(bin)}`;
  return silentWav;
}

export class Speaker {
  private speaking = false;
  /** Bumped on stop()/new speak(): cancels in-flight fetch loops and makes
   *  stale element events no-ops. */
  private session = 0;
  /** Two <audio> elements, unlocked inside the tap gesture and ping-ponged
   *  between chunks so the next one starts the instant the current ends. */
  private pool: HTMLAudioElement[] = [];
  private poolUnlocked = false;
  /** Per-chunk WAV object URLs for the current speak() (null = not ready). */
  private urls: (string | null)[] = [];
  private chunks: string[] = [];
  private playIdx = 0;
  /** True while an element is actually playing a chunk. */
  private busy = false;
  /** True once the fetch loop delivered (or gave up on) its last chunk. */
  private doneFeeding = true;
  /** First chunk index the fetcher permanently failed on (-1 = none):
   *  the rest of the text is spoken by the fallback engine, not dropped. */
  private failedFrom = -1;
  /** True once sound is REALLY coming out (element time is advancing). */
  private audioStarted = false;
  /** True when the current speak() runs on the fallback engine. */
  private usingSynth = false;
  private language = 'fr';
  /** Fired when speech ends by itself or on stop(). */
  onEnd: (() => void) | null = null;
  /** Fired when audio actually starts playing (after the first fetch). */
  onStart: (() => void) | null = null;

  get isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as any;
    return !!(w.Audio || w.speechSynthesis);
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * Create and unlock the <audio> pool. MUST run synchronously inside the
   * tap handler (mobile browsers only allow play() in a user gesture) —
   * speak() does it, but callers that await something between the tap and
   * speak() (labs generates the script first) should call warm() at the
   * top of the tap. Once an element has played inside a gesture, later
   * programmatic src changes + play() on the SAME element are allowed.
   */
  warm() {
    if (typeof window === 'undefined') return;
    const AudioCtor = (window as any).Audio;
    if (!AudioCtor) return;
    if (!this.pool.length) {
      for (let i = 0; i < 2; i++) {
        const el: HTMLAudioElement = new AudioCtor();
        el.preload = 'auto';
        (el as any).playsInline = true;
        this.pool.push(el);
      }
    }
    if (this.poolUnlocked) return;
    this.poolUnlocked = true;
    for (const el of this.pool) {
      try {
        el.src = silentWavUri();
        el.play()?.catch(() => {
          // Not in a gesture (or aborted by the real clip) — retry on the
          // next warm(); the failover watchdog covers the worst case.
          this.poolUnlocked = false;
        });
      } catch {
        this.poolUnlocked = false;
      }
    }
  }

  speak(text: string, language: string) {
    if (!this.isSupported) return;
    this.stopInternal(false);
    const clean = textForSpeech(text);
    if (!clean) return;
    this.language = language;
    this.warm();

    const session = ++this.session;
    this.speaking = true;
    this.audioStarted = false;
    this.usingSynth = false;

    // Natural Gemini voice; robotic engine only when it can't work.
    if (isDemoMode || !supabase || !this.pool.length) {
      this.speakWithSynth(clean, language, session);
      return;
    }
    this.speakNatural(clean, language, session)
      .then((ok) => {
        if (!ok && this.session === session) {
          // First chunk failed (offline / function down) → fallback voice.
          this.failoverToSynth(clean, language);
        }
      })
      .catch(() => {
        // ANY unexpected pipeline error must never end in silence.
        if (this.session === session) this.failoverToSynth(clean, language);
      });
    // Watchdog: whatever happens, the patient must HEAR something within
    // 15 s of the tap — if the natural voice hasn't AUDIBLY started by
    // then (generation too slow, hung request, playback blocked), switch
    // to the fallback engine. audioStarted is only set when the element's
    // clock advances, so a "playing" that produces no sound can't fool it.
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
    this.chunks = chunks;
    this.urls = new Array(chunks.length).fill(null);
    this.playIdx = 0;
    this.busy = false;
    this.failedFrom = -1;
    this.doneFeeding = false;
    const cancelled = () => this.session !== session;
    // Sliding window of 2 requests in flight: the tiny first chunk starts
    // fast while the second already generates; each arrival kicks the
    // fetch after next, so audio never has to wait on a cold request.
    const fetches: (Promise<{ audio: string; rate: number } | null> | null)[] =
      new Array(chunks.length).fill(null);
    const kick = (i: number) => {
      if (i < chunks.length && !fetches[i]) {
        // The first chunk gets 1 retry (the watchdog is ticking); later
        // ones get 2 — their wait is hidden behind the playing audio.
        fetches[i] = fetchTtsChunk(chunks[i], language, i === 0 ? 1 : 2, cancelled);
      }
    };
    kick(0);
    kick(1);
    for (let i = 0; i < chunks.length; i++) {
      const entry = await fetches[i];
      if (cancelled()) return true; // stopped meanwhile
      const url = entry ? pcmToWavUrl(entry.audio, entry.rate) : null;
      if (!url) {
        if (i === 0) {
          this.doneFeeding = true;
          return false;
        }
        this.failedFrom = i; // rest of the text → fallback voice
        break;
      }
      kick(i + 1);
      kick(i + 2);
      this.urls[i] = url;
      this.maybeStartNext(session);
    }
    this.doneFeeding = true;
    this.maybeDrain(session);
    return true;
  }

  /** Start the next ready chunk if nothing is playing. */
  private maybeStartNext(session: number) {
    if (this.session !== session || !this.speaking || this.busy) return;
    if (this.urls[this.playIdx]) this.playChunk(this.playIdx, session);
  }

  private playChunk(i: number, session: number) {
    const el = this.pool[i % 2];
    this.busy = true;
    el.onended = () => {
      if (this.session !== session) return;
      this.cleanupUrl(i);
      this.busy = false;
      this.playIdx = i + 1;
      this.maybeStartNext(session);
      this.maybeDrain(session);
    };
    // The element clock advancing is the only proof sound is coming out —
    // "play() succeeded" is NOT (muted/suspended playback lies).
    el.ontimeupdate = () => {
      if (this.session === session && !this.audioStarted && el.currentTime > 0.05) {
        this.audioStarted = true;
        this.onStart?.();
      }
    };
    el.onerror = () => {
      if (this.session === session) this.failPlayback(i);
    };
    el.src = this.urls[i]!;
    const p = el.play();
    p?.catch(() => {
      if (this.session === session) this.failPlayback(i);
    });
  }

  /** Element playback broke (blocked play, decode error): speak this and
   *  all remaining text with the fallback engine — never go silent. */
  private failPlayback(fromChunk: number) {
    this.session++; // cancels the fetch loop + stale element events
    const session = this.session;
    this.busy = false;
    this.doneFeeding = true;
    this.stopElements();
    this.revokeAll();
    this.speaking = true;
    const tail = this.chunks.slice(fromChunk).join(' ');
    if (tail) this.speakWithSynth(tail, this.language, session);
    else this.finish(session);
  }

  /** Called when feeding stopped: finish, or hand the unplayable rest of
   *  the text to the fallback engine (mid-text chunk failure). */
  private maybeDrain(session: number) {
    if (
      this.session !== session ||
      !this.speaking ||
      this.busy ||
      !this.doneFeeding
    ) {
      return;
    }
    if (this.failedFrom >= 0) {
      if (this.playIdx >= this.failedFrom) {
        const from = this.failedFrom;
        this.failedFrom = -1;
        const tail = this.chunks.slice(from).join(' ');
        if (tail) this.speakWithSynth(tail, this.language, session);
        else this.finish(session);
      }
      return;
    }
    if (this.playIdx >= this.chunks.length) this.finish(session);
  }

  /** Natural pipeline died (error or too slow): make SURE the patient
   *  still hears the text with the fallback engine. */
  private failoverToSynth(clean: string, language: string) {
    this.session++;
    this.busy = false;
    this.doneFeeding = true;
    this.failedFrom = -1;
    this.stopElements();
    this.revokeAll();
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
          if (this.session === session && !this.audioStarted) {
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

  private stopElements() {
    for (const el of this.pool) {
      el.onended = null;
      el.ontimeupdate = null;
      el.onerror = null;
      try {
        el.pause();
      } catch {}
      el.removeAttribute('src');
    }
  }

  private cleanupUrl(i: number) {
    const url = this.urls[i];
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      this.urls[i] = null;
    }
  }

  private revokeAll() {
    for (let i = 0; i < this.urls.length; i++) this.cleanupUrl(i);
    this.urls = [];
  }

  private stopInternal(fireEnd: boolean) {
    this.session++;
    const wasSpeaking = this.speaking;
    this.speaking = false;
    this.doneFeeding = true;
    this.busy = false;
    this.failedFrom = -1;
    this.stopElements();
    this.revokeAll();
    try {
      if (typeof window !== 'undefined') {
        (window as any).speechSynthesis?.cancel();
      }
    } catch {}
    if (fireEnd && wasSpeaking) this.onEnd?.();
  }
}
