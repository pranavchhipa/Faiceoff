import { redirect } from "next/navigation";

export default function DeprecatedNewCampaignPage() {
  redirect("/dashboard/creators");
}
