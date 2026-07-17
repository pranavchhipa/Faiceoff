import { redirect } from "next/navigation";

// The standalone Inbox page has no navigational entry points anywhere in the
// app — per-collab chat already works via the embedded ChatThread in
// creator/collabs/[id]/page.tsx. Redirect any bookmarked/direct hits there.
export default function CreatorInboxPage() {
  redirect("/creator/collabs");
}
