import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const localRoot = resolve(projectRoot, process.env.UPLOAD_DIRECTORY || 'server/uploads');

function provider() {
  return process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === 'production' ? 's3' : 'local');
}

function localPath(storageKey) {
  const target = resolve(localRoot, storageKey);
  if (!target.startsWith(`${localRoot}${sep}`)) {
    throw new Error('Invalid document storage key.');
  }
  return target;
}

function getS3Config() {
  const { AWS_REGION, S3_BUCKET } = process.env;
  if (!AWS_REGION || !S3_BUCKET) throw new Error('S3 document storage is not configured.');
  return { bucket: S3_BUCKET, client: new S3Client({ region: AWS_REGION }) };
}

export async function storeDocument(storageKey, buffer) {
  if (provider() === 'local') {
    const target = localPath(storageKey);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
    return;
  }

  if (provider() !== 's3') throw new Error('Unsupported document storage provider.');
  const { bucket, client } = getS3Config();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    Body: buffer,
    ContentType: 'application/pdf',
    ServerSideEncryption: 'AES256',
  }));
}

export async function openDocument(storageKey) {
  if (provider() === 'local') return createReadStream(localPath(storageKey));
  if (provider() !== 's3') throw new Error('Unsupported document storage provider.');
  const { bucket, client } = getS3Config();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
  if (!result.Body) throw new Error('Stored document is empty.');
  return result.Body;
}

export async function removeDocument(storageKey) {
  if (provider() === 'local') {
    try {
      await unlink(localPath(storageKey));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return;
  }

  if (provider() !== 's3') throw new Error('Unsupported document storage provider.');
  const { bucket, client } = getS3Config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}