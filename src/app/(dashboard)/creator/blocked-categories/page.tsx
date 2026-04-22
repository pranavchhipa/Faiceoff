import { cookies } from "next/headers";
import BlocksManager from "./blocks-manager";

interface BlockedCategory {
  category: string;
  blocked_at: string;
  reason: string | null;
}

async function fetchBlocked(): Promise<BlockedCategory[]> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const base = process.env.__NEXT_INTERNAL_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/creator/blocked-categories`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { blocked: BlockedCategory[] };
    return json.blocked ?? [];
  } catch {
    return [];
  }
}

export default async function BlockedCategoriesPage() {
  const blocked = await fetchBlocked();
  return <BlocksManager initialBlocked={blocked} />;
}
