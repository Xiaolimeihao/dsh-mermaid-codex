// run-tests.mjs — 回归测试：在本机 Chromium（Edge 无头）验证 PNG 导出管线的关键行为。
// 覆盖三个已踩过的坑：
//   1) 含 foreignObject 的 SVG 画入 canvas 会污染（toBlob 抛 SecurityError）
//   2) HTML 序列化的 &nbsp;/<br> 会破坏 SVG XML 解析
//   3) 纯 SVG（无 foreignObject）可以安全导出 PNG
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));

if (!EDGE) {
  console.error("Edge (Chromium) not found; cannot run export regression tests.");
  process.exit(2);
}

const run = (file) => {
  // --user-data-dir 必须独立：否则并入已有浏览器实例、不产出 DOM
  const profile = mkdtempSync(path.join(tmpdir(), "mmdr-test-"));
  try {
    const dom = execFileSync(
      EDGE,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        `--user-data-dir=${profile}`,
        "--virtual-time-budget=8000",
        "--dump-dom",
        `file:///${path.join(root, "tests", file).replace(/\\/g, "/")}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000 },
    );
    const m = /<title>(.*?)<\/title>/s.exec(dom);
    return m ? JSON.parse(m[1]) : null;
  } finally {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
};

let failed = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!cond) failed++;
};

const t1 = run("taint-and-serialize.html") || {};
check("taint: foreignObject SVG cannot export PNG", /taint/i.test(t1?.B_imgBlob?.stage || ""), t1?.B_imgBlob?.stage);
check("serialize: XMLSerializer removes &nbsp; hazard", t1?.serialize?.xmlHasNbsp === false && t1?.serialize?.htmlHasNbsp === true);
check("serialize: XMLSerializer removes bare <br> hazard", t1?.serialize?.xmlHasBrTag === false && t1?.serialize?.htmlHasBrTag === true);

const t2 = run("pure-svg-export.html") || {};
check("export: pure SVG rasterizes to PNG", t2?.pureSvgBlob?.ok === true, `bytes=${t2?.pureSvgBlob?.pngBytes}`);
check("export: PNG actually contains drawing", (t2?.pureSvgBlob?.nonWhitePixels ?? 0) > 1000, `px=${t2?.pureSvgBlob?.nonWhitePixels}`);
check("export: data-URL loading also works", t2?.pureSvgData?.ok === true);

console.log(failed === 0 ? "\nAll tests passed." : `\n${failed} test(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
