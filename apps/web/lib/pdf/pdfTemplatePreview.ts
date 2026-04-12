import { createClient } from "@/lib/supabase/server";
import { parseTemplateRow, deriveLabelResolversFromTemplate } from "@/app/api/pdf/_helpers";
import { normalizeBranding, resolvePdfContext } from "./resolvePdfContext";

type BuildPdfTemplatePreviewContextArgs = {
  templateRow: Record<string, any>;
  recordId?: string | null;
  recordData?: Record<string, any> | null;
  schema?: Record<string, any> | null;
};

export async function buildPdfTemplatePreviewContext(args: BuildPdfTemplatePreviewContextArgs) {
  const supabase = await createClient();
  const { data: branding } = await supabase.from("branding").select("*").limit(1).maybeSingle();
  const normalizedBranding = normalizeBranding(branding ?? null);
  const safeRecordData =
    args.recordData && typeof args.recordData === "object" && !Array.isArray(args.recordData)
      ? args.recordData
      : {};

  const recordId = String(args.recordId || "").trim();

  if (recordId) {
    const { related, template } = parseTemplateRow(args.templateRow);
    const labelResolvers = deriveLabelResolversFromTemplate(template);

    return resolvePdfContext({
      sourceTable: String(args.templateRow.source_table || ""),
      recordId,
      related,
      labelResolvers,
      recordOverride: safeRecordData,
    });
  }

  return {
    record: { ...safeRecordData },
    py: {},
    related: {},
    branding: normalizedBranding,
    empresa: normalizedBranding,
    now: new Date().toISOString(),
  };
}
