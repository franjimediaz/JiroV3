import { Render, webPuckConfig, type WebPuckData } from "@repo/web-puck";
import { Header } from "@repo/web-components";
import type { WebGlobalHeader } from "@repo/web-schema";

export function PublishedContent({ data, header }: { data: WebPuckData; header?: WebGlobalHeader }) {
  return <>{header?.enabled !== false ? (header ? <Header {...header} /> : null) : null}<Render config={webPuckConfig} data={data} /></>;
}
