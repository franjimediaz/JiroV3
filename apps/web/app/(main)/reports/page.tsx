import { requireUser } from "@/lib/auth/getCurrentUser";
import ReportsClient from "@/lib/reports/ReportsClient";

export default async function ReportsPage() {
  await requireUser();
  return <ReportsClient />;
}
