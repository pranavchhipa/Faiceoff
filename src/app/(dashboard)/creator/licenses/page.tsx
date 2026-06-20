import { redirect } from "next/navigation";

// The creator-facing Licenses page was removed — a creator's licensing activity
// now lives on their Collabs (each collab shows its signed agreement + the
// per-image licence certs). Redirect any bookmarked/direct hits there.
export default function CreatorLicensesPage() {
  redirect("/creator/collabs");
}
