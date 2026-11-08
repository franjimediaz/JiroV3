import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import WebEditorLoader from "./WebEditorLoader";

export const dynamic = "force-dynamic";

export default async function WebEditorPage() {
  const context = await getCurrentUser();
  if (!context) redirect("/login");
  if (context.role?.slug !== "systemadmin") redirect("/403");

  // Load the actual shared styles, without copying Bootstrap into Puck's iframe.
  const [tokens, components, puck] = await Promise.all([
    readFile(path.join(process.cwd(), "node_modules/@repo/web-components/src/styles/tokens.css"), "utf8"),
    readFile(path.join(process.cwd(), "node_modules/@repo/web-components/src/styles/components.css"), "utf8"),
    readFile(path.join(process.cwd(), "node_modules/@puckeditor/core/dist/no-external.css"), "utf8"),
  ]);
  const previewCss = [
    puck, tokens, components.replace('@import "./tokens.css";', ""),
    "html, body { margin: 0; background: #fff; } *, *::before, *::after { box-sizing: border-box; }",
  ].join("\n");
  return <WebEditorLoader previewCss={previewCss} />;
}
