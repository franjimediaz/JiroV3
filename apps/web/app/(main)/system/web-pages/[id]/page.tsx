import { notFound } from "next/navigation";
import { getWebPageById } from "@/actions/webPages";
import { requireWebAdmin } from "../requireWebAdmin";
import WebPageForm from "../WebPageForm";
export default async function Page({params}:{params:Promise<{id:string}>}){await requireWebAdmin();const result=await getWebPageById((await params).id);if(!result.ok){if(result.code==="NOT_FOUND")notFound();return <p role="alert">{result.message}</p>;}return <WebPageForm page={result.data}/>;}
