import { cookies } from "next/headers";
import { AdminLogin } from "@/components/admin-login";
import { TrackerApp } from "@/components/tracker-app";
import { ADMIN_COOKIE_NAME, verifyAdminSession } from "@/lib/admin-session";

export const instant = false;

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSession(token)) {
    return <AdminLogin />;
  }

  return <TrackerApp view="admin" />;
}
