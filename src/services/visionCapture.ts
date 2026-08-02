/**
 * WHAT EVERY VISION CAPTURE PATH MUST DO THE SAME WAY.
 *
 * Two things were written inline in `app/scan.tsx` and were about to be written
 * a second time for the scan-to-add sheet inside "Modifier les aliments". Both
 * are the kind of rule that is only correct while it is identical everywhere:
 *
 *   · `prepareImageForVision` — the image the model actually receives. Send a
 *     different size or quality from a second entry point and the SAME plate
 *     detects differently depending on which button was pressed, which is
 *     indefensible when the output seeds an insulin dose.
 *
 *   · `scanErrorKey` — whose fault the failure was. This one was fought for:
 *     the app used to answer every failure with "vérifiez votre connexion",
 *     so an overloaded vision model read to the patient as a broken phone. A
 *     second copy of that mapping is a second chance to regress it.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** The image as the vision model receives it, plus the exact dimensions sent —
 *  the reference frame for any bounding box the model returns. */
export interface PreparedImage {
  base64: string;
  width: number;
  height: number;
}

/**
 * Normalize a captured or picked image before it goes to the vision model:
 * resize to 1024 px wide (ratio preserved), re-encode JPEG 0.8. The model then
 * always gets the FULL frame at a consistent, detail-rich size.
 *
 * Returns `null` when manipulation fails, so the caller can fall back to the
 * raw picker image rather than losing the scan.
 */
export async function prepareImageForVision(uri: string): Promise<PreparedImage | null> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: 1024 }); // height omitted → ratio preserved
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
    if (!out.base64) return null;
    console.log(
      `[scan] sending ${out.width}x${out.height} JPEG, ~${Math.round(out.base64.length / 1024)}KB (b64)`
    );
    return { base64: out.base64, width: out.width, height: out.height };
  } catch (e) {
    console.warn('[scan] prepareImageForVision failed, falling back to raw image', e);
    return null;
  }
}

/**
 * The i18n key for a failed scan — WHOSE FAULT IT WAS.
 *
 * The patient must not be sent to their wifi settings because our upstream is
 * busy. `analyze-meal` answers `code: 'ai_unavailable'` (HTTP 503) once its
 * retries are spent, which is a fact about OUR provider and gets its own
 * sentence. A quota or rate limit gets a third. Only what is left keeps the
 * connection wording, because then it really might be the network.
 */
export function scanErrorKey(
  e: unknown
): 'scanner.rateLimited' | 'scanner.serviceBusy' | 'scanner.scanFailed' {
  const err = e as { message?: string; code?: string; context?: { status?: number } };
  const msg = String(err?.message ?? e);
  if (/429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg)) return 'scanner.rateLimited';
  if (
    err?.code === 'ai_unavailable' ||
    /ai_unavailable/i.test(msg) ||
    err?.context?.status === 503
  )
    return 'scanner.serviceBusy';
  return 'scanner.scanFailed';
}
