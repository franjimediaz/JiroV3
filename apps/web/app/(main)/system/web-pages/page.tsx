import { listWebPages } from "@/actions/webPages";
import { requireWebAdmin } from "./requireWebAdmin";
import WebPagesClient from "./WebPagesClient";
export default async function Page(){ await requireWebAdmin(); const result=await listWebPages(); return <WebPagesClient result={result}/>; }
