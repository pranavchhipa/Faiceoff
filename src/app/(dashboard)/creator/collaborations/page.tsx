import { redirect } from "next/navigation";

// This legacy page (thin wrapper around dashboard/campaigns) is superseded
// by /creator/collabs. Redirect any bookmarked/direct hits there.
export default function CreatorCollaborationsPage() {
  redirect("/creator/collabs");
}
