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
  rotationDegrees: number | null;
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

    // Debug: inspect what ffprobe thinks about the stream and our rotation-based swap.
    // Keep this local/dev-only to avoid spamming production logs.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(
        '[probeVideo] full videoStream:',
        JSON.stringify(videoStream, null, 2),
      );
      // eslint-disable-next-line no-console
      console.log('[probeVideo] rotation tag:', videoStream?.tags?.rotate);
      // eslint-disable-next-line no-console
      console.log(
        '[probeVideo] side_data_list:',
        JSON.stringify(videoStream?.side_data_list, null, 2),
      );
      // eslint-disable-next-line no-console
      console.log('[probeVideo] raw w/h:', videoStream?.width, videoStream?.height);
      // eslint-disable-next-line no-console
      console.log('[probeVideo] after swap w/h:', width, height);
    }

    return {
      mediaWidth: width,
      mediaHeight: height,
      durationSec: duration,
      rotationDegrees: rotation,
    };
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function extractFirstFrameThumbnailJpeg(
  buffer: Buffer,
  mimetype: string,
  rotationDegrees: number | null,
): Promise<Buffer> {
  const tmpExt =
    mimetype.includes('mp4') ? 'mp4' : mimetype.includes('quicktime') ? 'mov' : mimetype.includes('webm') ? 'webm' : 'mp4';

  const tmpVideoPath = path.join(os.tmpdir(), `liveline-thumb-${uuidv4()}.${tmpExt}`);
  const tmpFramePath = path.join(os.tmpdir(), `liveline-thumb-${uuidv4()}.jpg`);
  await fs.writeFile(tmpVideoPath, buffer);

  try {
    ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
    ffmpeg.setFfprobePath(ffprobeStatic.path);

    const scaleFilter =
      "scale='if(gt(a,1),360,-2)':'if(gt(a,1),-2,360)':force_original_aspect_ratio=decrease";

    // Map ffprobe rotation degrees to ffmpeg transpose filters.
    // - 90  => rotate 90° clockwise
    // - 270 => rotate 90° counterclockwise
    // (we also handle -90/-270 because ffprobe sometimes reports negatives)
    let transposeFilter = '';
    if (rotationDegrees != null) {
      const r = rotationDegrees;
      if (r === 90) transposeFilter = 'transpose=dir=1';
      if (r === -90 || r === 270) transposeFilter = 'transpose=dir=2';
      if (r === 180 || r === -180) transposeFilter = 'rotate=PI';
    }

    const vf = transposeFilter ? `${transposeFilter},${scaleFilter}` : scaleFilter;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpVideoPath)
        // Do not auto-apply rotation metadata; we apply it explicitly above.
        .inputOptions(['-noautorotate'])
        .seekInput(0)
        .frames(1)
        .videoFilters(vf)
        .outputOptions(['-q:v', '4'])
        .output(tmpFramePath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    return await fs.readFile(tmpFramePath);
  } finally {
    await fs.unlink(tmpVideoPath).catch(() => {});
    await fs.unlink(tmpFramePath).catch(() => {});
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

    // Extract real upright/display dimensions for correct masonry aspect.
    // If extraction fails, return null dims; the client will fall back.
    let probe: VideoProbeResult | null = null;
    try {
      probe = await probeVideo(file.buffer, file.mimetype);
    } catch {
      probe = null;
    }

    // Best-effort: generate a real thumbnail from the first frame.
    // This prevents feed tiles from falling back to the bland play-icon placeholder.
    let videoThumbnailUrl: string | null = null;
    try {
      const thumbKey = `${baseKey}_thumb.jpg`;
      const thumbBuffer = await extractFirstFrameThumbnailJpeg(
        file.buffer,
        file.mimetype,
        probe?.rotationDegrees ?? null,
      );

      await supabaseAdmin.storage
        .from('thumbnails')
        .upload(thumbKey, thumbBuffer, { contentType: 'image/jpeg', upsert: true });

      const { data: thumbPublic } = supabaseAdmin.storage.from('thumbnails').getPublicUrl(thumbKey);
      videoThumbnailUrl = thumbPublic.publicUrl;
    } catch {
      videoThumbnailUrl = null;
    }

    return {
      mediaUrl: mediaPublic.publicUrl,
      thumbnailUrl: videoThumbnailUrl,
      durationSec: probe?.durationSec ?? 5,
      mediaWidth: probe?.mediaWidth ?? null,
      mediaHeight: probe?.mediaHeight ?? null,
    };
  },
};