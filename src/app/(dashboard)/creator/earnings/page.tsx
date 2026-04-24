import { cookies } from "next/headers";
import EarningsCards from "./earnings-cards";

interface DashboardData {
  available_paise: number;
  holding_paise: number;
  pending_count: number;
  lifetime_earned_paise: number;
  min_payout_paise: number;
  can_withdraw: boolean;
}

async function fetchDashboard(): Promise<DashboardData> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  try {
    const base = process.env.__NEXT_INTERNAL_URL ?? "http://localhost:3000";
    const res = await fetch(
      `${base}/api/earnings/dashboard`,
      {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      },
    );
    if (!res.ok) throw new Error("fetch failed");
    return (await res.json()) as DashboardData;
  } catch {
    return {
      available_paise: 0,
      holding_paise: 0,
      pending_count: 0,
      lifetime_earned_paise: 0,
      min_payout_paise: 50000,
      can_withdraw: false,
    };
  }
}

export default async function EarningsPage() {
  const data = await fetchDashboard();
  return <EarningsCards data={data} />;
}
