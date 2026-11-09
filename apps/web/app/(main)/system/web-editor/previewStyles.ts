import {readFile} from "node:fs/promises";
import path from "node:path";
export async function previewStyles(){
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
  return previewCss;
}
