// Admin home alias — redirects to /admin (the real admin landing).
// Legacy /dashboard redirects + nav links may still target /admin/dashboard;
// this page just bounces to the canonical /admin route.
import { redirect } from "next/navigation";

export default function AdminDashboardAlias() {
  redirect("/admin");
}
