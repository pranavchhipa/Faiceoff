import Replicate from 'replicate';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const replicate = new Replicate({
  auth: getEnvVar('REPLICATE_API_TOKEN'),
});
