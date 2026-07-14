import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { LabReport, LabValue } from '@/types';

/* ────────────────────────────────────────────────────────────
 * LAB ANALYSES ("ta7alil")
 * The patient photographs a blood-test report; the lab-analyze edge
 * function extracts every value, writes a patient-friendly report and a
 * spoken doctor-style explanation. This module is the client side: API
 * calls + the text-to-speech player for the spoken explanation.
 * ──────────────────────────────────────────────────────────── */

export interface LabExtraction {
  values: LabValue[];
  summary: string;
  reportDate: string | null;
  labName: string | null;
}

/** Short patient context line the prompts personalize with. */
function labPatientContext(): string {
  const { profile } = useAppStore.getState();
  if (!profile) return '';
  return (
    `${profile.name || '?'}, diabetes ${profile.diabetes_type}, ` +
    `target glucose ${profile.target_low}-${profile.target_high} mg/dL, ` +
    `weight ${profile.weight ?? '?'} kg, height ${profile.height ?? '?'} cm.`
  );
}

async function invokeLab<T>(body: Record<string, unknown>): Promise<T> {
  if (isDemoMode || !supabase) throw new Error('demo');
  const { data, error } = await supabase.functions.invoke('lab-analyze', {
    body: { ...body, patientContext: labPatientContext() },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.result as T;
}

/** Read a photographed lab report → structured values. */
export function extractLabReport(
  imageBase64: string,
  language: string
): Promise<LabExtraction> {
  return invokeLab<LabExtraction>({
    task: 'extract',
    image_base64: imageBase64,
    language,
  });
}

/** Full patient-friendly medical report for a set of values. */
export async function generateLabReportText(
  report: Pick<LabReport, 'values' | 'summary' | 'report_date'>,
  language: string
): Promise<string> {
  const { profile } = useAppStore.getState();
  const r = await invokeLab<{ report: string }>({
    task: 'report',
    values: report.values,
    summary: report.summary ?? '',
    reportDate: report.report_date ?? null,
    patientName: profile?.name?.trim().split(/\s+/)[0] ?? '',
    language,
  });
  return r.report;
}

/** Spoken doctor-style explanation script (plain text for TTS). */
export async function generateLabVoiceScript(
  report: Pick<LabReport, 'values' | 'summary'>,
  language: string
): Promise<string> {
  const { profile } = useAppStore.getState();
  const r = await invokeLab<{ script: string }>({
    task: 'voice',
    values: report.values,
    summary: report.summary ?? '',
    patientName: profile?.name?.trim().split(/\s+/)[0] ?? '',
    language,
  });
  return r.script;
}

/** Detailed explanation of one tapped value. */
export async function explainLabValue(
  value: LabValue,
  language: string
): Promise<string> {
  const { profile } = useAppStore.getState();
  const r = await invokeLab<{ explanation: string }>({
    task: 'value',
    value,
    patientName: profile?.name?.trim().split(/\s+/)[0] ?? '',
    language,
  });
  return r.explanation;
}

/* ───────────────────────── TTS player ─────────────────────────
 * Speaks the doctor script with the browser's speechSynthesis (web).
 * Long scripts are split into sentences and queued — one giant
 * utterance gets cut off by some engines. start/stop only, exactly
 * like a doctor you can interrupt. */

const TTS_LANG_TAGS: Record<string, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  en: 'en-US',
  ar: 'ar-SA',
};

export class LabSpeaker {
  private speaking = false;
  /** Fired when speech ends by itself or on stop(). */
  onEnd: (() => void) | null = null;

  get isSupported(): boolean {
    return typeof window !== 'undefined' && !!(window as any).speechSynthesis;
  }

  /** Prefer a voice that matches the language exactly. */
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
    const synth = (window as any).speechSynthesis;
    synth.cancel();
    const tag = TTS_LANG_TAGS[language] ?? 'en-US';
    const voice = this.pickVoice(tag);
    // Split on sentence ends; keep chunks readable for the engine.
    const sentences = text
      .replace(/\s+/g, ' ')
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
