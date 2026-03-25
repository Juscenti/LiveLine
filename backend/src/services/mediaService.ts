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

    let width = videoStream?.width != null ? Number(videoStream.width) : null;
    let height = videoStream?.height != null ? Number(videoStream.height) : null;

    if (width != null && (!Number.isFinite(width) || width <= 0)) width = null;
    if (height != null && (!Number.isFinite(height) || height <= 0)) height = null;

    // Rotation is typically stored as tags.rotate, but we defensively probe a few locations.
    const rotation =
      parseRotationDegrees(videoStream?.tags?.rotate) ??
      parseRotationDegrees(videoStream?.tags?.rotation) ??
      parseRotationDegrees(videoStream?.rotation) ??
      // Some ffprobe builds expose rotation inside Display Matrix side-data.
      (Array.isArray(videoStream?.side_data_list)
        ? parseRotationDegrees(videoStream.side_data_list.find((sd: any) => sd?.rotation != null)?.rotation)
        : null);

    const needsSwap = rotation != null && (rotation === 90 || rotation === 270 || rotation === -90 || rotation === -270);
    if (needsSwap && width != null && height != null) {
      [width, height] = [height, width];
    }

    return {
      mediaWidth: width,
      mediaHeight: height,
      durationSec: duration,
    };
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

export const mediaService = {
  /**
   * MVP-friendly processing:
   * - images: resize inside max 1080×1080 (preserves aspect), JPEG + square thumb
   * - videos: upload as-is; media dimensions extracted from ffprobe (rotation corrected)
   */
  async processAndUpload(file: MulterFile, userId: string, mediaType: MediaType): Promise<ProcessedMedia> {
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

    // IMPORTANT: temporarily bypass ffprobe-based metadata extraction while
    // we validate video playback correctness on the client.
    // Once videos reliably decode again, we'll re-enable ffprobe extraction.
    return {
      mediaUrl: mediaPublic.publicUrl,
      thumbnailUrl: null,
      durationSec: null,
      mediaWidth: null,
      mediaHeight: null,
    };
  },
};
