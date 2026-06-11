import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

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
  // R2 doesn't support the flexible-checksum trailers newer AWS SDKs send by
  // default — only compute checksums when an operation requires them.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  // Hard network timeouts: the SDK default is NO request timeout, so a stalled
  // connection hangs the generation pipeline silently until the platform kills
  // the function (rows stuck in 'generating'). With these, a bad connection
  // becomes a thrown error → the pipeline's catch marks the row 'failed'.
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 5_000,
    requestTimeout: 30_000,
  }),
});

export const R2_BUCKET_NAME = getEnvVar('R2_BUCKET_NAME');
