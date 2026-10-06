import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface StorageProvider {
  name: string;
  save(key: string, buffer: Buffer, mimeType: string): Promise<{ url: string; key: string }>;
  remove(key: string): Promise<void>;
}

export const uploadRoot = path.resolve(process.cwd(), config.uploadDir);

class LocalStorage implements StorageProvider {
  name = 'local';
  async save(key: string, buffer: Buffer) {
    const full = path.join(uploadRoot, key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
    return { key, url: `/api/v1/uploads/${key}` };
  }
  async remove(key: string) { await fs.promises.rm(path.join(uploadRoot, key), { force: true }); }
}

// Any S3-compatible service (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces). Requires `yarn add @aws-sdk/client-s3`.
class S3Storage implements StorageProvider {
  name = 's3';
  private client: any;
  private sdk: any;
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    this.sdk = require('@aws-sdk/client-s3');
    this.client = new this.sdk.S3Client({
      region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: !!process.env.S3_ENDPOINT,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
    });
  }
  async save(key: string, buffer: Buffer, mimeType: string) {
    await this.client.send(new this.sdk.PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: mimeType }));
    return { key, url: `${process.env.S3_PUBLIC_URL}/${key}` };
  }
  async remove(key: string) { await this.client.send(new this.sdk.DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); }
}

export const storage: StorageProvider = config.storageProvider === 's3' ? new S3Storage() : new LocalStorage();

const SIGNATURES: [string, (b: Buffer) => boolean][] = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8],
  ['image/png', (b) => b.subarray(0, 4).toString('hex') === '89504e47'],
  ['image/webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'],
  ['image/heic', (b) => b.subarray(4, 8).toString() === 'ftyp'],
  ['image/heif', (b) => b.subarray(4, 8).toString() === 'ftyp'],
];
export const ALLOWED_IMAGE_TYPES = SIGNATURES.map((s) => s[0]);
export function isValidImage(buffer: Buffer, mime: string) {
  const sig = SIGNATURES.find((s) => s[0] === mime);
  return !!sig && buffer.length > 12 && sig[1](buffer);
}
