import ReportFormClient from "@/lib/reports/ReportFormClient";
import { reportsPageAccess } from "@/lib/reports/access";

export default async function NewReportPage() {
  const { schema } = await reportsPageAccess("crear");
  return <ReportFormClient mode="create" schema={schema} />;
}
