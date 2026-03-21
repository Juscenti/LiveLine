import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
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

/** Placeholder 9:16 frame for video until FFmpeg extracts real dimensions. */
const VIDEO_PLACEHOLDER_W = 1080;
const VIDEO_PLACEHOLDER_H = 1920;

export const mediaService = {
  /**
   * MVP-friendly processing:
   * - images: resize inside max 1080×1080 (preserves aspect), JPEG + square thumb
   * - videos: upload as-is; dimensions placeholder for masonry layout
   */
  async processAndUpload(file: MulterFile, userId: string, mediaType: MediaType): Promise<ProcessedMedia> {
    const baseKey = `${userId}/${uuidv4()}`;

    if (mediaType === 'image') {
      const jpegBuffer = await sharp(file.buffer)
        .rotate()
        .resize({
          width: 1080,
          height: 1080,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 82 })
        .toBuffer();

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

    return {
      mediaUrl: mediaPublic.publicUrl,
      thumbnailUrl: null,
      durationSec: 5,
      mediaWidth: VIDEO_PLACEHOLDER_W,
      mediaHeight: VIDEO_PLACEHOLDER_H,
    };
  },
};
