import { cookies } from "next/headers";
import WithdrawWizard from "./withdraw-wizard";

interface DashboardData {
  available_paise: number;
  holding_paise: number;
  pending_count: number;
  lifetime_earned_paise: number;
  min_payout_paise: number;
  can_withdraw: boolean;
}

interface BankAccount {
  id: string;
  account_number_last4: string;
  ifsc_code: string;
  account_holder_name: string;
  is_primary: boolean;
}

async function fetchDashboard(): Promise<DashboardData> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const base = process.env.__NEXT_INTERNAL_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/earnings/dashboard`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("failed");
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

async function fetchBankAccounts(): Promise<BankAccount[]> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const base = process.env.__NEXT_INTERNAL_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/creator/bank-accounts`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { accounts?: BankAccount[] };
    return json.accounts ?? [];
  } catch {
    return [];
  }
}

export default async function WithdrawPage() {
  const [dashboard, accounts] = await Promise.all([
    fetchDashboard(),
    fetchBankAccounts(),
  ]);

  return <WithdrawWizard dashboard={dashboard} bankAccounts={accounts} />;
}
