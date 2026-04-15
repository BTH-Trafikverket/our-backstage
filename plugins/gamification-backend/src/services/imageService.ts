import { InputError } from '@backstage/errors';
import sharp from 'sharp';

const DEFAULT_MAX_BADGE_IMAGE_PIXELS = 4096 * 4096;
const SUPPORTED_BADGE_IMAGE_FORMATS = new Set([
  'jpeg',
  'png',
  'webp',
  'gif',
  'tiff',
  'heif',
  'avif',
]);

export async function processImage(
  fileBuffer: Buffer,
  options?: { maxInputPixels?: number },
): Promise<string> {
  const image = sharp(fileBuffer, {
    failOn: 'error',
    limitInputPixels: options?.maxInputPixels ?? DEFAULT_MAX_BADGE_IMAGE_PIXELS,
  });

  let metadata;
  try {
    metadata = await image.metadata();
  } catch (error) {
    throw new InputError('Uploaded file is not a valid image');
  }

  if (!metadata.format || !SUPPORTED_BADGE_IMAGE_FORMATS.has(metadata.format)) {
    throw new InputError('Only raster image formats are allowed');
  }

  const processed = await image
    .resize(128, 128)
    .webp({ quality: 70 })
    .toBuffer();

  return `data:image/webp;base64,${processed.toString('base64')}`;
}
