import { getWebPageDraft } from "@/actions/webPages";
import { createEditorExample } from "./fixture";
import { previewStyles } from "./previewStyles";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import WebEditorLoader from "./WebEditorLoader";

export const dynamic = "force-dynamic";

export default async function WebEditorPage() {
  const context = await getCurrentUser();
  if (!context) redirect("/login");
  if (context.role?.slug !== "systemadmin") redirect("/403");

  const draft = await getWebPageDraft();
  const initialData = draft?.puckData ?? createEditorExample();
  if (draft) initialData.root.props = { ...initialData.root.props, title: draft.title };

  const previewCss = await previewStyles();
  return <WebEditorLoader previewCss={previewCss} initialData={initialData} initialRevision={draft?.revision ?? null} description={draft?.description ?? null} pageId={draft?.id} publicPath="/" />;
}
