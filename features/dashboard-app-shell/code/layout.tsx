import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { demoUser } from "@/lib/demo-data";

/**
 * Route group layout for every authenticated dashboard page.
 * Checks the session cookie server-side and hands the chrome off to
 * DashboardChrome (a client component) so interactive state like the
 * mobile drawer can live in one place. Middleware also guards these
 * routes, but the explicit check here is the source of truth for direct
 * server-to-server navigation.
 */
export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  return (
    <DashboardChrome userEmail={demoUser.email}>{children}</DashboardChrome>
  );
}
