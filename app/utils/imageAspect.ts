// ============================================================
// Resolve width/height aspect from a remote or file image URI.
// expo-image onLoad sometimes reports 0×0 (esp. certain Android/Web);
// React Native Image.getSize reads intrinsic size without full decode issues.
// ============================================================
import { Image as RNImage } from 'react-native';
import { normalizeAspectFromPixels } from '@/utils/feedMasonry';

export function measureImageAspectFromUri(uri: string): Promise<number | null> {
  const u = uri.trim();
  if (!u) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      RNImage.getSize(
        u,
        (w, h) => {
          if (w > 0 && h > 0) resolve(normalizeAspectFromPixels(w, h));
          else resolve(null);
        },
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}
