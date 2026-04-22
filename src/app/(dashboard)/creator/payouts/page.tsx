import { cookies } from "next/headers";
import PayoutsTable from "./payouts-table";

interface PayoutItem {
  id: string;
  amount_paise?: number;
  gross_amount_paise?: number;
  tds_paise?: number;
  tds_amount_paise?: number;
  fee_paise?: number;
  processing_fee_paise?: number;
  net_paise?: number;
  net_amount_paise?: number;
  status: string;
  requested_at: string;
  completed_at: string | null;
  utr?: string | null;
  cf_transfer_id?: string | null;
  failure_reason: string | null;
}

interface ListResponse {
  items: PayoutItem[];
  total: number;
  page: number;
  pageSize: number;
}

async function fetchPayouts(): Promise<ListResponse> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const base = process.env.__NEXT_INTERNAL_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/payouts/list?page=1`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("failed");
    return (await res.json()) as ListResponse;
  } catch {
    return { items: [], total: 0, page: 1, pageSize: 20 };
  }
}

export default async function PayoutsPage() {
  const initial = await fetchPayouts();
  return <PayoutsTable initial={initial} />;
}
