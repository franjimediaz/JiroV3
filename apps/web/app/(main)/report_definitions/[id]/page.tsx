import { notFound } from "next/navigation";
import ReportFormClient from "@/lib/reports/ReportFormClient";
import { reportsPageAccess } from "@/lib/reports/access";

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  const { id } = await params;
  const mode = (await searchParams).edit === "true" ? "edit" : "view";
  const { schema } = await reportsPageAccess(mode === "edit" ? "actualizar" : "ver");
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) notFound();
  return <ReportFormClient key={`${id}:${mode}`} id={id} mode={mode} schema={schema} />;
}
