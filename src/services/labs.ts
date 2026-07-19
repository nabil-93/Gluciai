import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { LabReport, LabValue } from '@/types';
import { asQuotaError } from './usage';

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
  const quota = await asQuotaError(error, data);
  if (quota) throw quota;
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

/* The TTS player for the doctor script lives in @/lib/speech (natural
 * Gemini voice + speechSynthesis fallback), shared with the chat's
 * "listen" button. */
