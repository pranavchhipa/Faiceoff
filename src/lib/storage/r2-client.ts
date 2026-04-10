import { S3Client } from '@aws-sdk/client-s3';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const accountId = getEnvVar('R2_ACCOUNT_ID');

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: getEnvVar('R2_ACCESS_KEY_ID'),
    secretAccessKey: getEnvVar('R2_SECRET_ACCESS_KEY'),
  },
});

export const R2_BUCKET_NAME = getEnvVar('R2_BUCKET_NAME');
