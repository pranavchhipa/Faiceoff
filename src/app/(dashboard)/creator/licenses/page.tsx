import { cookies } from "next/headers";
import LicensesList from "./licenses-list";

interface LicenseItem {
  id: string;
  brand_id: string;
  creator_id: string;
  scope: string;
  is_category_exclusive: boolean;
  exclusive_category: string | null;
  amount_paid_paise: number;
  creator_share_paise: number;
  issued_at: string;
  expires_at: string;
  auto_renew: boolean;
  renewed_count: number;
  status: string;
  revoked_at: string | null;
  revocation_reason: string | null;
  cert_url: string | null;
  creator_display_name: string;
  brand_company_name: string;
  days_to_expiry: number;
}

interface ListResponse {
  items: LicenseItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

async function fetchLicenses(): Promise<ListResponse> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const base = process.env.__NEXT_INTERNAL_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/licenses/list?page=1`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("failed");
    return (await res.json()) as ListResponse;
  } catch {
    return { items: [], total: 0, page: 1, pageSize: 20 };
  }
}

export default async function LicensesPage() {
  const initial = await fetchLicenses();
  return <LicensesList initial={initial} />;
}
