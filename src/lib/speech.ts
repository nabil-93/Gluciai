/* ────────────────────────────────────────────────────────────
 * TEXT-TO-SPEECH ("read it out loud")
 * Reads a piece of text with the browser's Web Speech API. GluciAI ships
 * as a web PWA, so speechSynthesis is available on the phones that run it —
 * the same engine the lab "voice doctor" uses. This lets a patient who
 * cannot read (or doesn't want to) LISTEN to the assistant's answer.
 * start / stop only, like a voice you can interrupt.
 * ──────────────────────────────────────────────────────────── */

const TTS_LANG_TAGS: Record<string, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  en: 'en-US',
  ar: 'ar-SA',
};

/**
 * Pick the voice language. Replies are often in Moroccan Darija: when the
 * text is written mostly in ARABIC SCRIPT, read it with an Arabic voice
 * whatever the UI language; otherwise use the UI language (Darija written
 * in Latin letters reads best with the French/English voice the user set).
 */
function speechTag(text: string, uiLang: string): string {
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (arabic > latin && arabic > 3) return 'ar-SA';
  return TTS_LANG_TAGS[uiLang] ?? 'en-US';
}

/** Strip chat tokens/markup that shouldn't be spoken (food-link tokens,
 *  bare markdown emphasis, list bullets). */
export function textForSpeech(raw: string): string {
  return raw
    .replace(/\[\[food:[a-z0-9-]+(?:\|[^\]]*)?\]\]/gi, '') // recommendation cards
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/^[\s]*[-•]\s+/gm, '') // list bullets
    .replace(/\s+/g, ' ')
    .trim();
}

export class Speaker {
  private speaking = false;
  /** Fired when speech ends by itself or on stop(). */
  onEnd: (() => void) | null = null;

  get isSupported(): boolean {
    return typeof window !== 'undefined' && !!(window as any).speechSynthesis;
  }

  /** Prefer a voice that matches the language exactly, then its base. */
  private pickVoice(tag: string): SpeechSynthesisVoice | null {
    try {
      const voices = (window as any).speechSynthesis.getVoices() as SpeechSynthesisVoice[];
      return (
        voices.find((v) => v.lang === tag) ??
        voices.find((v) => v.lang.startsWith(tag.split('-')[0])) ??
        null
      );
    } catch {
      return null;
    }
  }

  speak(text: string, language: string) {
    if (!this.isSupported) return;
    const clean = textForSpeech(text);
    if (!clean) return;
    const synth = (window as any).speechSynthesis;
    synth.cancel();
    const tag = speechTag(clean, language);
    const voice = this.pickVoice(tag);
    // Split on sentence ends; one giant utterance gets cut off by some
    // engines, so we queue readable chunks.
    const sentences = clean
      .split(/(?<=[.!?؟])\s+/)
      .filter((s) => s.trim());
    if (!sentences.length) return;
    this.speaking = true;
    sentences.forEach((sentence, i) => {
      const u = new (window as any).SpeechSynthesisUtterance(sentence);
      u.lang = tag;
      if (voice) u.voice = voice;
      u.rate = 0.98;
      u.pitch = 1;
      if (i === sentences.length - 1) {
        u.onend = () => {
          this.speaking = false;
          this.onEnd?.();
        };
      }
      u.onerror = () => {
        // A cancelled queue fires error on pending utterances — only the
        // final state matters.
        if (i === sentences.length - 1 && this.speaking) {
          this.speaking = false;
          this.onEnd?.();
        }
      };
      synth.speak(u);
    });
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  stop() {
    if (!this.isSupported) return;
    const wasSpeaking = this.speaking;
    this.speaking = false;
    try {
      (window as any).speechSynthesis.cancel();
    } catch {}
    if (wasSpeaking) this.onEnd?.();
  }
}
