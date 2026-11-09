import { notFound } from "next/navigation";
import { getWebPageById } from "@/actions/webPages";
import { requireWebAdmin } from "../../web-pages/requireWebAdmin";
import { previewStyles } from "../previewStyles";
import WebEditorLoader from "../WebEditorLoader";
export default async function Page({params}:{params:Promise<{id:string}>}){await requireWebAdmin();const result=await getWebPageById((await params).id);if(!result.ok){if(result.code==="NOT_FOUND")notFound();return <p role="alert">{result.message}</p>;}const page=result.data;return <WebEditorLoader key={page.id} previewCss={await previewStyles()} initialData={page.puckData} initialRevision={page.revision} description={page.description} pageId={page.id} publicPath={page.path}/>;}
