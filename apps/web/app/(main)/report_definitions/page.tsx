import ReportsPageClient from "@/lib/reports/ReportsPageClient";
import { reportsPageAccess } from "@/lib/reports/access";

export default async function ReportsPage() {
  const { schema } = await reportsPageAccess();
  return <ReportsPageClient schema={schema} />;
}
