import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface PickedImage {
  /** Local URI, for previewing the thumbnail in the chat. */
  uri: string;
  /** Bare base64 JPEG (no data: prefix) — what the vision model wants. */
  base64: string;
}

/** Resize to 1024px wide + JPEG 0.8 so uploads stay small and consistent. */
async function prepare(uri: string, rawBase64?: string): Promise<PickedImage | null> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width: 1024 });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
    if (out.base64) return { uri: out.uri ?? uri, base64: out.base64 };
  } catch {
    // fall through to the raw picker base64
  }
  return rawBase64 ? { uri, base64: rawBase64.replace(/^data:image\/[^;]+;base64,/, '') } : null;
}

/** Open the camera and return the captured photo (normalized). */
export async function capturePhoto(): Promise<PickedImage | null> {
  try {
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 1,
    });
    const asset = shot.assets?.[0];
    if (!asset?.uri) return null;
    return prepare(asset.uri, asset.base64 ?? undefined);
  } catch {
    return null;
  }
}

/** Pick an existing photo from the library (normalized). */
export async function pickPhoto(): Promise<PickedImage | null> {
  try {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 1,
    });
    const asset = picked.assets?.[0];
    if (!asset?.uri) return null;
    return prepare(asset.uri, asset.base64 ?? undefined);
  } catch {
    return null;
  }
}
