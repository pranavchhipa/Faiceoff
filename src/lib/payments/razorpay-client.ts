import Razorpay from 'razorpay';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const razorpay = new Razorpay({
  key_id: getEnvVar('RAZORPAY_KEY_ID'),
  key_secret: getEnvVar('RAZORPAY_KEY_SECRET'),
});
