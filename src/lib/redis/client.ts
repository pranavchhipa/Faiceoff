import { Redis } from '@upstash/redis';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const redis = new Redis({
  url: getEnvVar('UPSTASH_REDIS_REST_URL'),
  token: getEnvVar('UPSTASH_REDIS_REST_TOKEN'),
});
