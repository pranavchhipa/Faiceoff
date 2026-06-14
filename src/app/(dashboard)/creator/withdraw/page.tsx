import { redirect } from "next/navigation";

// Creators no longer withdraw themselves — Earnings + Withdraw merged into the
// single /creator/earnings section (add bank + "Request payout", paid manually
// by an operator). This route just forwards there. withdraw-wizard.tsx is left
// on disk, unused.
export default function WithdrawPage() {
  redirect("/creator/earnings");
}
