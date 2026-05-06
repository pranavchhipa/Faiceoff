import { razorpayRequest } from "./client";

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  notes: Record<string, string>;
  created_at: number;
}

export interface CreateOrderParams {
  amount_paise: number;
  receipt: string;
  notes?: Record<string, string>;
}

export async function createRazorpayOrder(params: CreateOrderParams): Promise<RazorpayOrder> {
  return razorpayRequest<RazorpayOrder>("POST", "/orders", {
    amount: params.amount_paise,
    currency: "INR",
    receipt: params.receipt.slice(0, 40), // Razorpay: max 40 chars
    notes: params.notes ?? {},
  });
}

/** Public key safe to expose to frontend */
export function getRazorpayKeyId(): string {
  const key = process.env.RAZORPAY_KEY_ID;
  if (!key) throw new Error("RAZORPAY_KEY_ID not set");
  return key;
}
