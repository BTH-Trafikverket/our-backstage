import sharp from 'sharp';

export async function processImage(fileBuffer: Buffer): Promise<string> {
  const processed = await sharp(fileBuffer)
    .resize(128, 128)
    .webp({ quality: 70 })
    .toBuffer();

  return `data:image/webp;base64,${processed.toString('base64')}`;
}
