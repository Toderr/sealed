import { redirect } from "next/navigation";

// /admin is just an entry point — send it to the Deals view.
export default function AdminIndex() {
  redirect("/admin/deals");
}
