// build.mjs — 用 esbuild 打包 client.js（单 IIFE，mermaid 全量内联）
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [path.join(root, "build", "src", "client-entry.js")],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2021",
  outfile: path.join(root, "client.js"),
  logLevel: "info",
});
