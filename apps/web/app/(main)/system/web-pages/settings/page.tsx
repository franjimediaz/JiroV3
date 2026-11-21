import { getWebSiteSettings } from "@/actions/webSiteSettings";
import { requireWebAdmin } from "../requireWebAdmin";
import WebSiteSettings from "./WebSiteSettings";

export default async function Page() {
  await requireWebAdmin();
  return <WebSiteSettings result={await getWebSiteSettings()} />;
}
