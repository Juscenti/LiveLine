import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { supabaseAdmin } from '../config/supabase';

type MediaType = 'image' | 'video';

type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

export type ProcessedMedia = {
  mediaUrl: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
};

type VideoProbeResult = {
  mediaWidth: number | null;
  mediaHeight: number | null;
  rotationDegrees: number | null;
  durationSec: number | null;
};

function parseRotationDegrees(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // ffprobe might return 90, 270, -90, -270 or 0
  return n;
}

async function probeVideo(buffer: Buffer, mimetype: string): Promise<VideoProbeResult> {
  const tmpExt =
    mimetype.includes('mp4') ? 'mp4' : mimetype.includes('quicktime') ? 'mov' : mimetype.includes('webm') ? 'webm' : 'mp4';

  const tmpPath = path.join(os.tmpdir(), `liveline-${uuidv4()}.${tmpExt}`);
  await fs.writeFile(tmpPath, buffer);

  try {
    // Ensure fluent-ffmpeg uses bundled binaries
    ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
    ffmpeg.setFfprobePath(ffprobeStatic.path);

    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(tmpPath, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });

    const duration =
      metadata?.format?.duration != null && Number.isFinite(Number(metadata.format.duration))
        ? Number(metadata.format.duration)
        : null;

    const streams: any[] = Array.isArray(metadata?.streams) ? metadata.streams : [];
    const videoStream =
      streams.find((s) => s && s.codec_type === 'video') ?? streams[0] ?? null;

    const width = videoStream?.width != null ? Number(videoStream.width) : null;
    const height = videoStream?.height != null ? Number(videoStream.height) : null;

    const cleanWidth = width != null && Number.isFinite(width) && width > 0 ? width : null;
    const cleanHeight = height != null && Number.isFinite(height) && height > 0 ? height : null;

    // Rotation is typically stored as tags.rotate, but we defensively probe a few locations.
    const rotation =
      parseRotationDegrees(videoStream?.tags?.rotate) ??
      parseRotationDegrees(videoStream?.tags?.rotation) ??
      parseRotationDegrees(videoStream?.rotation) ??
      // Some ffprobe builds expose rotation inside Display Matrix side-data.
      (Array.isArray(videoStream?.side_data_list)
        ? parseRotationDegrees(videoStream.side_data_list.find((sd: any) => sd?.rotation != null)?.rotation)
        : null);

    return {
      mediaWidth: cleanWidth,
      mediaHeight: cleanHeight,
      rotationDegrees: rotation,
      durationSec: duration,
    };
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function probeVideoFile(p: string): Promise<VideoProbeResult> {
  // Reuse the probeVideo implementation by reading the file back.
  // (Keeping this small and safe beats trying to avoid temp IO.)
  const buf = await fs.readFile(p);
  // mimetype isn't available here; ffprobe works fine based on container sniffing.
  return probeVideo(buf, 'video/mp4');
}

type TransformCandidate = {
  key: 'none' | 'transpose1' | 'transpose2';
  aspectArHint?: number;
};

function aspectFromDims(w: number | null, h: number | null): number | null {
  if (!w || !h) return null;
  return w / h;
}

function arDistance(a: number, b: number): number {
  // Compare on log scale so 2:1 vs 1:2 isn’t treated as same linear error.
  return Math.abs(Math.log(a / b));
}

async function extractUprightVideoDimsViaTransforms(
  buffer: Buffer,
  mimetype: string,
  targetAspect: number | null,
): Promise<{ mediaWidth: number | null; mediaHeight: number | null; durationSec: number | null }> {
  const tmpExt =
    mimetype.includes('mp4') ? 'mp4' : mimetype.includes('quicktime') ? 'mov' : mimetype.includes('webm') ? 'webm' : 'mp4';

  const inPath = path.join(os.tmpdir(), `liveline-${uuidv4()}-in.${tmpExt}`);
  await fs.writeFile(inPath, buffer);

  try {
    ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
    ffmpeg.setFfprobePath(ffprobeStatic.path);

    // Candidate strategy:
    // - Always include "none" (raw stream dims).
    // - Also include transpose=1 and transpose=2 to cover the common iOS 90°/270° rotation metadata cases.
    const candidates: TransformCandidate[] = [
      { key: 'none' },
      { key: 'transpose1' },
      { key: 'transpose2' },
    ];

    const probeNone = await new Promise<VideoProbeResult>((resolve, reject) => {
      ffmpeg.ffprobe(inPath, (err, data) => {
        if (err) return reject(err);
        // Hack: reuse probeVideo parsing by writing a minimal adapter.
        // We can’t call probeVideo(inPath) because it expects a buffer; so just parse here.
        const streams: any[] = Array.isArray(data?.streams) ? data.streams : [];
        const videoStream = streams.find((s) => s && s.codec_type === 'video') ?? streams[0] ?? null;
        const duration =
          data?.format?.duration != null && Number.isFinite(Number(data.format.duration))
            ? Number(data.format.duration)
            : null;

        const width = videoStream?.width != null ? Number(videoStream.width) : null;
        const height = videoStream?.height != null ? Number(videoStream.height) : null;
        const cleanWidth = width != null && Number.isFinite(width) && width > 0 ? width : null;
        const cleanHeight = height != null && Number.isFinite(height) && height > 0 ? height : null;

        const rotation =
          parseRotationDegrees(videoStream?.tags?.rotate) ??
          parseRotationDegrees(videoStream?.tags?.rotation) ??
          parseRotationDegrees(videoStream?.rotation) ??
          (Array.isArray(videoStream?.side_data_list)
            ? parseRotationDegrees(videoStream.side_data_list.find((sd: any) => sd?.rotation != null)?.rotation)
            : null);

        resolve({
          mediaWidth: cleanWidth,
          mediaHeight: cleanHeight,
          rotationDegrees: rotation,
          durationSec: duration,
        });
      });
    });

    const durationSec = probeNone.durationSec;

    const results: Record<string, { mediaWidth: number | null; mediaHeight: number | null }> = {
      none: { mediaWidth: probeNone.mediaWidth, mediaHeight: probeNone.mediaHeight },
    };

    const probeTransform = async (outPath: string, key: TransformCandidate['key']) => {
      const res = await probeVideoFile(outPath).catch(() => null);
      if (!res) return;
      results[key] = { mediaWidth: res.mediaWidth, mediaHeight: res.mediaHeight };
    };

    const runTranspose = async (key: TransformCandidate['key']) => {
      if (key === 'none') return;
      const outPath = path.join(os.tmpdir(), `liveline-${uuidv4()}-${key}.${tmpExt}`);
      const transposeFilter = key === 'transpose1' ? 'transpose=1' : 'transpose=2';

      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(inPath)
            .videoFilters(transposeFilter)
            .noAudio()
            .format('mp4')
            .outputOptions(['-movflags', 'faststart', '-preset', 'veryfast', '-crf', '23'])
            .on('end', () => resolve())
            .on('error', (e) => reject(e))
            .save(outPath);
        });

        await probeTransform(outPath, key);
      } finally {
        await fs.unlink(outPath).catch(() => {});
      }
    };

    // Only run transforms if we have a target; otherwise we keep it lightweight.
    if (targetAspect != null) {
      await Promise.all(candidates.filter((c) => c.key !== 'none').map((c) => runTranspose(c.key)));
    }

    if (targetAspect == null) {
      return {
        mediaWidth: probeNone.mediaWidth,
        mediaHeight: probeNone.mediaHeight,
        durationSec,
      };
    }

    const scored = candidates
      .map((c) => {
        const w = results[c.key]?.mediaWidth ?? null;
        const h = results[c.key]?.mediaHeight ?? null;
        const ar = aspectFromDims(w, h);
        if (!ar) return { key: c.key, score: Number.POSITIVE_INFINITY };
        return { key: c.key, score: arDistance(ar, targetAspect) };
      })
      .sort((a, b) => a.score - b.score);

    const bestKey = scored[0]?.key ?? 'none';
    return {
      mediaWidth: results[bestKey]?.mediaWidth ?? probeNone.mediaWidth,
      mediaHeight: results[bestKey]?.mediaHeight ?? probeNone.mediaHeight,
      durationSec,
    };
  } finally {
    await fs.unlink(inPath).catch(() => {});
  }
}

export const mediaService = {
  /**
   * MVP-friendly processing:
   * - images: resize inside max 1080×1080 (preserves aspect), JPEG + square thumb
   * - videos: upload as-is; media dimensions extracted from ffprobe (rotation corrected)
   */
  async processAndUpload(
    file: MulterFile,
    userId: string,
    mediaType: MediaType,
    clientMediaWidth?: number | null,
    clientMediaHeight?: number | null,
  ): Promise<ProcessedMedia> {
    const baseKey = `${userId}/${uuidv4()}`;

    if (mediaType === 'image') {
      let jpegBuffer: Buffer;
      try {
        jpegBuffer = await sharp(file.buffer)
          .rotate()
          .resize({
            width: 1080,
            height: 1080,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 82 })
          .toBuffer();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Image processing failed (${msg}). Try a JPEG/PNG from Library or retake the photo.`);
      }

      const meta = await sharp(jpegBuffer).metadata();
      const mediaWidth = meta.width ?? null;
      const mediaHeight = meta.height ?? null;

      const thumbBuffer = await sharp(jpegBuffer)
        .resize(360, 360, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();

      const mediaKey = `${baseKey}.jpg`;
      const thumbKey = `${baseKey}_thumb.jpg`;

      await supabaseAdmin.storage
        .from('posts-processed')
        .upload(mediaKey, jpegBuffer, { contentType: 'image/jpeg', upsert: true });
      await supabaseAdmin.storage
        .from('thumbnails')
        .upload(thumbKey, thumbBuffer, { contentType: 'image/jpeg', upsert: true });

      const { data: mediaPublic } = supabaseAdmin.storage.from('posts-processed').getPublicUrl(mediaKey);
      const { data: thumbPublic } = supabaseAdmin.storage.from('thumbnails').getPublicUrl(thumbKey);

      return {
        mediaUrl: mediaPublic.publicUrl,
        thumbnailUrl: thumbPublic.publicUrl,
        durationSec: null,
        mediaWidth,
        mediaHeight,
      };
    }

    const mediaKey = `${baseKey}.mp4`;

    await supabaseAdmin.storage
      .from('posts-processed')
      .upload(mediaKey, file.buffer, { contentType: 'video/mp4', upsert: true });

    const { data: mediaPublic } = supabaseAdmin.storage.from('posts-processed').getPublicUrl(mediaKey);

    // Extract real upright/display dimensions for correct masonry aspect.
    // If the server can't interpret iOS rotation metadata reliably, we use
    // the client’s measured aspect ratio as a target for picking between
    // "none" and common transpose variants.
    const targetAspect =
      clientMediaWidth != null && clientMediaHeight != null && clientMediaWidth > 0 && clientMediaHeight > 0
        ? clientMediaWidth / clientMediaHeight
        : null;

    let dims: Awaited<ReturnType<typeof extractUprightVideoDimsViaTransforms>> | null = null;
    try {
      dims = await extractUprightVideoDimsViaTransforms(file.buffer, file.mimetype, targetAspect);
    } catch {
      dims = null;
    }

    return {
      mediaUrl: mediaPublic.publicUrl,
      thumbnailUrl: null,
      durationSec: dims?.durationSec ?? 5,
      mediaWidth: dims?.mediaWidth ?? null,
      mediaHeight: dims?.mediaHeight ?? null,
    };
  },
};
