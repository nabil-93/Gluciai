// Supabase Edge Function: gen-dish-image — generates ONE appetizing photo for
// a curated Moroccan dish with Gemini 2.5 Flash Image ("Nano Banana"), uploads
// it to the public `dish-images` storage bucket, and returns the public URL.
// Uses the server-side GEMINI_API_KEY + SERVICE_ROLE so no key leaves the
// server. Called offline by scripts/gen-dish-images.mjs (human reviews result).
//
// Deploy: npx supabase functions deploy gen-dish-image --project-ref ftqyzpkzqeudzfztataz

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { isAdminCaller } from '../_shared/adminGuard.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const IMG_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-2.5-flash-image';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'dish-images';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function imagePrompt(d: any): string {
  const en = d.name_en || d.name_fr;
  return `A professional, appetizing food photograph of "${en}" (${d.name_fr}), an
authentic MOROCCAN ${d.category || 'dish'}. Freshly served, styled on a simple
rustic ceramic plate or traditional tagine, soft natural daylight, shallow depth
of field, top-down or 45° angle, vivid natural colors, high detail, restaurant
quality. The dish must clearly be "${en}" and look healthy and homemade. No text,
no watermark, no hands, no cutlery brand, plain neutral background.`;
}

async function genImageBase64(d: any): Promise<{ data: string; mime: string } | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMG_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: imagePrompt(d) }] }],
          generationConfig: { responseModalities: ['IMAGE'], temperature: 0.6 },
        }),
        signal: AbortSignal.timeout(90_000),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const parts = j.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const inline = p.inlineData ?? p.inline_data;
      if (inline?.data) return { data: inline.data, mime: inline.mimeType ?? inline.mime_type ?? 'image/png' };
    }
    return null;
  } catch {
    return null;
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function upload(id: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
  const objectPath = `${id}.${ext}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!r.ok) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Offline tooling only — otherwise anyone with the public anon key could
    // burn image-generation quota AND overwrite dish photos in the public
    // bucket (x-upsert with a caller-chosen id).
    if (!(await isAdminCaller(req))) {
      return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const d = await req.json();
    if (!d?.id) return new Response(JSON.stringify({ ok: false, error: 'no id' }), { status: 400, headers: corsHeaders });
    const img = await genImageBase64(d);
    if (!img) return new Response(JSON.stringify({ id: d.id, ok: false, error: 'gen failed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const url = await upload(d.id, b64ToBytes(img.data), img.mime);
    if (!url) return new Response(JSON.stringify({ id: d.id, ok: false, error: 'upload failed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ id: d.id, ok: true, url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: corsHeaders });
  }
});
