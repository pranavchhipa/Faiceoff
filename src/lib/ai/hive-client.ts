const HIVE_API_URL = 'https://api.thehive.ai/api/v2/task/sync';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface HiveModerationResult {
  status: Array<{
    response: {
      output: Array<{
        classes: Array<{
          class: string;
          score: number;
        }>;
      }>;
    };
  }>;
}

/**
 * Submit an image URL to Hive Moderation for content safety analysis.
 */
export async function checkImage(imageUrl: string): Promise<HiveModerationResult> {
  const apiKey = getEnvVar('HIVE_API_KEY');

  const response = await fetch(HIVE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: imageUrl,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Hive Moderation API error (${response.status}): ${errorBody}`,
    );
  }

  return response.json() as Promise<HiveModerationResult>;
}
