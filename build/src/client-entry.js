// client-entry.js — DSH client module: Codex-style mermaid diagram cards.
// 产物 client.js 由 esbuild 打包为单个 IIFE 脚本（见 build/build.mjs）。
//
// 设计约束（由实测环境决定）：
// - 页面 CSP 禁止内联 <style>：所有样式走行内 style 属性 + JS 事件
// - 含 foreignObject 的 SVG 会污染 canvas：PNG 导出用 htmlLabels:false 纯 SVG 重渲染
// - SVG 序列化必须用 XMLSerializer（HTML 序列化的 &nbsp; / <br> 破坏 XML 解析）
// - mermaid.render 会往 body 塞临时测量节点：统一用 fixed 离屏容器防抖动
import mermaid from "mermaid";

const MODULE_ID = "dsh-mermaid-codex";
// DOM 结构版本：结构变化后递增，旧块强制用新 UI 重画
const UI_VERSION = "10";

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */
const IS_ZH = /^zh/i.test((typeof navigator !== "undefined" && navigator.language) || "");
const T = IS_ZH
  ? {
      copyCode: "复制为代码",
      copyImage: "复制为图片",
      downloadPng: "下载 PNG",
      downloadSvg: "下载 SVG",
      toggleSource: "显示源码",
      toggleDiagram: "显示图表",
      scale: "倍率",
      background: "背景",
      bgWhite: "白",
      bgTransparent: "透明",
      fullscreen: "全屏查看",
      moreActions: "更多操作",
      close: "关闭",
      zoomIn: "放大",
      zoomOut: "缩小",
      zoomFit: "恢复 1:1",
      retry: "重试",
      renderError: "图表渲染失败（语法错误）",
      pngFailed: "PNG 导出失败，已改为下载 SVG",
      imageCopied: "图片已复制到剪贴板",
      copyFailed: "复制图片失败",
    }
  : {
      copyCode: "Copy code",
      copyImage: "Copy image",
      downloadPng: "Download PNG",
      downloadSvg: "Download SVG",
      toggleSource: "Show code",
      toggleDiagram: "Show diagram",
      scale: "Scale",
      background: "Background",
      bgWhite: "White",
      bgTransparent: "Transparent",
      fullscreen: "Fullscreen",
      moreActions: "More actions",
      close: "Close",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      zoomFit: "Reset to 1:1",
      retry: "Retry",
      renderError: "Diagram failed to render (syntax error)",
      pngFailed: "PNG export failed; downloaded SVG instead",
      imageCopied: "Image copied to clipboard",
      copyFailed: "Failed to copy image",
    };

/* ------------------------------------------------------------------ */
/* 主题（深/浅色自适应）                                                */
/* ------------------------------------------------------------------ */
const MERMAID_FONT = '"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif';
const PALETTE_LIGHT = {
  dark: false,
  card: "#ffffff",
  border: "#e2e5e9",
  text: "#1f2328",
  text2: "#6b7280",
  hover: "#f1f3f5",
  hoverStrong: "#e9ecef",
  shadowSm: "0 1px 2px rgba(0,0,0,.06)",
  shadowMd: "0 6px 18px rgba(0,0,0,.12)",
  shadowLg: "0 24px 64px rgba(0,0,0,.3)",
  overlay: "rgba(15,18,20,.55)",
  dangerBg: "#fdecea",
  dangerText: "#b3261e",
  toastBg: "#1f2328",
  toastText: "#ffffff",
  mermaid: {
    primaryColor: "#dae8fc",
    primaryBorderColor: "#b7cdf2",
    primaryTextColor: "#1f4e9c",
    lineColor: "#9aa0a6",
    fontFamily: MERMAID_FONT,
  },
};
const PALETTE_DARK = {
  dark: true,
  card: "#262a31",
  border: "#3a4048",
  text: "#e8eaed",
  text2: "#9aa0a6",
  hover: "#333942",
  hoverStrong: "#3a4048",
  shadowSm: "0 1px 2px rgba(0,0,0,.4)",
  shadowMd: "0 6px 18px rgba(0,0,0,.5)",
  shadowLg: "0 24px 64px rgba(0,0,0,.6)",
  overlay: "rgba(0,0,0,.65)",
  dangerBg: "#3a2326",
  dangerText: "#f2b8b5",
  toastBg: "#e8eaed",
  toastText: "#1f2328",
  mermaid: {
    primaryColor: "#2b3245",
    primaryBorderColor: "#4a5568",
    primaryTextColor: "#e6e9ef",
    lineColor: "#8b93a1",
    fontFamily: MERMAID_FONT,
  },
};

const luminance = (css) => {
  const m = /rgba?\(([^)]+)\)/.exec(css || "");
  if (!m) return null;
  const parts = m[1].split(",").map((n) => parseFloat(n));
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  if (!(a > 0.1)) return null; // 透明背景不可判色
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

const readPalette = () => {
  let lum = luminance(getComputedStyle(document.body).backgroundColor);
  if (lum === null) lum = luminance(getComputedStyle(document.documentElement).backgroundColor);
  let dark;
  if (lum === null) {
    dark = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } else {
    dark = lum < 0.5;
  }
  return dark ? PALETTE_DARK : PALETTE_LIGHT;
};

const configFor = (pal, plain) => ({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  themeVariables: { ...pal.mermaid },
  ...(plain ? { htmlLabels: false } : {}),
});

let PALETTE = readPalette();
mermaid.initialize(configFor(PALETTE, false));

/* ------------------------------------------------------------------ */
/* 图表识别 / 哈希                                                      */
/* ------------------------------------------------------------------ */
const FALLBACK_TYPE =
  /^\s*(graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie\s|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4\w+|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta|radar-beta|treemap-beta)/;

const detectKind = (source) => {
  try {
    const kind = mermaid.detectType(source);
    if (kind) return kind;
  } catch {
    /* fall through */
  }
  return FALLBACK_TYPE.test(source) ? "fallback" : undefined;
};

const djb2 = (str) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  return String(hash >>> 0);
};

/* ------------------------------------------------------------------ */
/* 图标（Lucide 风格，线条 2px）                                        */
/* ------------------------------------------------------------------ */
const icon = (paths, size = 14) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON_EXPAND = icon('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>');
const ICON_CLOSE = icon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
const ICON_MORE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`;
const ICON_COPY = icon('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
const ICON_COPY_IMAGE = icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/><line x1="15" y1="21" x2="21" y2="15"/>');
const ICON_IMAGE = icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>');
const ICON_DOWNLOAD = icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
const ICON_CODE = icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');
const ICON_WARN = icon('<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>');
const ICON_RETRY = icon('<polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>');
const ICON_PLUS = icon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 15);
const ICON_MINUS = icon('<line x1="5" y1="12" x2="19" y2="12"/>', 15);
const ICON_FIT = icon('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>', 15);

/* ------------------------------------------------------------------ */
/* 导出偏好（分辨率 / 背景），跨会话记忆                                  */
/* ------------------------------------------------------------------ */
const exportPrefs = { scale: 2, transparent: false };
try {
  const saved = JSON.parse(localStorage.getItem("mmdr-export-prefs") || "{}");
  if ([1, 2, 3].includes(saved.scale)) exportPrefs.scale = saved.scale;
  if (typeof saved.transparent === "boolean") exportPrefs.transparent = saved.transparent;
} catch {
  /* ignore */
}
const saveExportPrefs = () => {
  try {
    localStorage.setItem("mmdr-export-prefs", JSON.stringify(exportPrefs));
  } catch {
    /* ignore */
  }
};

/* ================================================================== */
window.__ModuleLoader__.load({
  id: MODULE_ID,
  factory() {
    return {
      inject: [],
      apply(ctx) {
        /* ---------------- 渲染队列（并发 3，导出独占） ---------------- */
        const queue = { active: 0, waiting: [], exportActive: false, exportWaiters: [] };
        const pump = () => {
          while (!queue.exportActive && queue.active < 3 && queue.waiting.length) {
            queue.waiting.shift()();
          }
        };
        const pumpExports = () => {
          if (queue.exportActive || queue.active > 0 || !queue.exportWaiters.length) return;
          queue.exportWaiters.shift()();
        };
        const runTask = (fn, isExport) =>
          new Promise((resolve, reject) => {
            const start = () => {
              if (isExport) queue.exportActive = true;
              else queue.active++;
              Promise.resolve()
                .then(fn)
                .then(resolve, reject)
                .finally(() => {
                  if (isExport) {
                    queue.exportActive = false;
                    pumpExports();
                  } else {
                    queue.active--;
                    pump();
                    pumpExports();
                  }
                });
            };
            if (isExport) queue.exportWaiters.push(start);
            else queue.waiting.push(start);
            isExport ? pumpExports() : pump();
          });

        /* ---------------- 状态 ---------------- */
        let counter = 0;
        let themeGen = 0;
        const exportCache = new Map();

        const contentOf = (block) => block.querySelector(":scope > [data-code-block-content]");
        const sourceOf = (block) => {
          const content = contentOf(block);
          return content ? (content.textContent ?? "").trim() : null;
        };

        const unprocess = (block) => {
          block.querySelector(":scope > .mmdr-root")?.remove();
          block.querySelector(":scope > .mmdr-error")?.remove();
          const content = contentOf(block);
          if (content) content.style.removeProperty("display");
          delete block.dataset.mmdrState;
          delete block.dataset.mmdrHash;
          delete block.dataset.mmdrV;
        };

        // 清扫历史版本的残留 DOM（旧版类名）
        const sweepLegacy = () => {
          for (const stray of document.querySelectorAll(".mmdr-holder, .mmdr-toolbar, .mmdr-toggle")) {
            stray.remove();
          }
        };

        /* ---------------- 通用 UI 元件 ---------------- */
        const iconButton = (title, svg, size = 26, round = false) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.title = title;
          btn.setAttribute("aria-label", title);
          btn.innerHTML = svg;
          btn.style.cssText =
            `width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;` +
            `border:1px solid ${PALETTE.border};border-radius:${round ? "50%" : "9px"};cursor:pointer;` +
            `background:${PALETTE.card};color:${PALETTE.text2};box-shadow:${PALETTE.shadowSm};` +
            "padding:0;transition:background .12s ease,color .12s ease,transform .12s ease;";
          btn.addEventListener("mouseenter", () => {
            btn.style.background = PALETTE.hover;
            btn.style.color = PALETTE.text;
            btn.style.transform = "translateY(-1px)";
          });
          btn.addEventListener("mouseleave", () => {
            btn.style.background = PALETTE.card;
            btn.style.color = PALETTE.text2;
            btn.style.transform = "none";
          });
          return btn;
        };

        const menuItem = (label, svg) => {
          const item = document.createElement("button");
          item.type = "button";
          item.setAttribute("role", "menuitem");
          item.style.cssText =
            "display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:none;cursor:pointer;" +
            `background:transparent;color:${PALETTE.text};font-size:13px;line-height:1.5;` +
            "padding:7px 10px;border-radius:8px;font-family:inherit;white-space:nowrap;" +
            "transition:background .1s ease;";
          const glyph = document.createElement("span");
          glyph.innerHTML = svg;
          glyph.style.cssText =
            "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;" +
            `color:${PALETTE.text2};flex:none;transition:color .1s ease;`;
          const text = document.createElement("span");
          text.textContent = label;
          item.appendChild(glyph);
          item.appendChild(text);
          item.addEventListener("mouseenter", () => {
            item.style.background = PALETTE.hover;
            glyph.style.color = PALETTE.text;
          });
          item.addEventListener("mouseleave", () => {
            item.style.background = "transparent";
            glyph.style.color = PALETTE.text2;
          });
          return item;
        };

        const menuSeparator = () => {
          const sep = document.createElement("div");
          sep.setAttribute("role", "separator");
          sep.style.cssText = `height:1px;background:${PALETTE.border};opacity:.7;margin:5px 8px;`;
          return sep;
        };

        // 选项行：左标签 + 右分段控件（圆角胶囊）
        const optionRow = (label, options, getValue, onPick) => {
          const row = document.createElement("div");
          row.style.cssText =
            "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 10px;";
          const tag = document.createElement("span");
          tag.textContent = label;
          tag.style.cssText = `font-size:12px;color:${PALETTE.text2};`;
          const seg = document.createElement("div");
          seg.style.cssText =
            `display:inline-flex;gap:2px;padding:2px;border-radius:9px;background:${PALETTE.hoverStrong};`;
          const segButtons = [];
          for (const opt of options) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = opt.label;
            b.style.cssText =
              "border:none;cursor:pointer;font-family:inherit;font-size:11.5px;line-height:1.5;" +
              "padding:2px 9px;border-radius:7px;transition:background .1s ease,color .1s ease,box-shadow .1s ease;";
            b.addEventListener("click", () => {
              onPick(opt.value);
              for (const other of segButtons) other.paint();
            });
            b.paint = () => {
              const active = getValue() === opt.value;
              b.style.background = active ? PALETTE.card : "transparent";
              b.style.color = active ? PALETTE.text : PALETTE.text2;
              b.style.boxShadow = active ? PALETTE.shadowSm : "none";
            };
            b.paint();
            segButtons.push(b);
            seg.appendChild(b);
          }
          row.appendChild(tag);
          row.appendChild(seg);
          return row;
        };

        const toast = (text) => {
          const box = document.createElement("div");
          box.textContent = text;
          box.setAttribute("role", "status");
          box.style.cssText =
            "position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(6px);z-index:10000;" +
            `background:${PALETTE.toastBg};color:${PALETTE.toastText};font-size:12.5px;` +
            "padding:9px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.25);" +
            "opacity:0;transition:opacity .18s ease,transform .18s ease;pointer-events:none;";
          document.body.appendChild(box);
          window.requestAnimationFrame(() => {
            box.style.opacity = "1";
            box.style.transform = "translateX(-50%) translateY(0)";
          });
          window.setTimeout(() => {
            box.style.opacity = "0";
            window.setTimeout(() => box.remove(), 220);
          }, 2600);
        };

        /* ---------------- 导出管线 ---------------- */
        // 离屏渲染：fixed 容器不参与页面布局，避免临时测量节点引起抖动。
        // plain=true 用纯 SVG 文本标签（无 foreignObject，不污染 canvas）。
        const renderToMarkup = async (source, plain, isExport) =>
          runTask(async () => {
            const id = `mmdr-${++counter}`;
            const host = document.createElement("div");
            host.style.cssText =
              "position:fixed;left:-100000px;top:0;overflow:hidden;opacity:0;pointer-events:none;";
            document.body.appendChild(host);
            try {
              if (plain) mermaid.initialize(configFor(PALETTE, true));
              const { svg } = await mermaid.render(id, source, host);
              return svg;
            } finally {
              if (plain) mermaid.initialize(configFor(PALETTE, false));
              host.remove();
              document.getElementById(`d${id}`)?.remove();
              document.getElementById(id)?.remove();
            }
          }, isExport);

        const triggerDownload = (blob, filename) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        };

        const svgBlobOf = (svgEl) => {
          const clone = svgEl.cloneNode(true);
          const vb = clone.viewBox && clone.viewBox.baseVal;
          const w = vb && vb.width ? Math.round(vb.width) : 0;
          clone.style.cssText = w ? `width:${w}px;height:auto;display:block;` : "display:block;height:auto;";
          let markup;
          try {
            markup = new XMLSerializer().serializeToString(clone);
          } catch {
            markup = clone.outerHTML;
          }
          return new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
        };

        // 三级加载：blob URL → data URL → createImageBitmap
        const loadSvgImage = (markup) => {
          const svgBlob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
          return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(url);
              resolve(img);
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              const img2 = new Image();
              img2.onload = () => resolve(img2);
              img2.onerror = () => {
                if (typeof createImageBitmap === "function") {
                  createImageBitmap(svgBlob).then(resolve, reject);
                } else {
                  reject(new Error("svg image load failed"));
                }
              };
              img2.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
            };
            img.src = url;
          });
        };

        const buildPngBlob = async (source, cacheKey) => {
          const cached = exportCache.get(cacheKey);
          if (cached) return cached;
          if (exportCache.size > 32) exportCache.clear();
          const task = (async () => {
            const pureMarkup = await renderToMarkup(source, true, true);
            const wrap = document.createElement("div");
            wrap.innerHTML = pureMarkup;
            const el = wrap.querySelector("svg");
            if (!el) throw new Error("no svg in export render");
            const vb = el.viewBox && el.viewBox.baseVal;
            const w = (vb && vb.width) || el.clientWidth || 800;
            const h = (vb && vb.height) || el.clientHeight || 600;
            el.setAttribute("width", String(Math.round(w)));
            el.setAttribute("height", String(Math.round(h)));
            let markup;
            try {
              markup = new XMLSerializer().serializeToString(el);
            } catch {
              markup = el.outerHTML;
            }
            const image = await loadSvgImage(markup);
            const scale = exportPrefs.scale;
            const raster = document.createElement("canvas");
            raster.width = Math.round(w * scale);
            raster.height = Math.round(h * scale);
            const ctx2d = raster.getContext("2d");
            if (!exportPrefs.transparent) {
              ctx2d.fillStyle = PALETTE.dark ? "#1e2229" : "#ffffff";
              ctx2d.fillRect(0, 0, raster.width, raster.height);
            }
            ctx2d.drawImage(image, 0, 0, raster.width, raster.height);
            const png = await new Promise((resolve) => raster.toBlob(resolve, "image/png"));
            if (!png) throw new Error("png encode failed");
            return png;
          })().catch((err) => {
            exportCache.delete(cacheKey);
            throw err;
          });
          exportCache.set(cacheKey, task);
          return task;
        };

        const cacheKeyOf = (hash) => `${hash}|t${themeGen}|s${exportPrefs.scale}|${exportPrefs.transparent ? "t" : "w"}`;
        const prefetchExport = (source, hash) => {
          buildPngBlob(source, cacheKeyOf(hash)).catch(() => {});
        };

        /* ---------------- 滚轮缩放（光标锚点） ---------------- */
        const attachZoom = (viewport, stage, naturalW, requireCtrl, onZoom) => {
          const svgEl = stage.querySelector("svg");
          if (!svgEl || !naturalW) return null;
          let zoom = 1;
          const notifyZoom = () => onZoom && onZoom(zoom);
          const apply = () => {
            svgEl.style.width = `${Math.round(naturalW * zoom)}px`;
            const relaxed = zoom !== 1;
            svgEl.style.maxWidth = relaxed ? "none" : "100%";
            stage.style.maxWidth = relaxed ? "none" : "100%";
            notifyZoom();
          };
          const zoomTo = (next, cx, cy) => {
            next = Math.min(5, Math.max(0.25, next));
            if (next === zoom) return;
            const rect = viewport.getBoundingClientRect();
            const px = cx === undefined ? rect.width / 2 : cx - rect.left;
            const py = cy === undefined ? rect.height / 2 : cy - rect.top;
            const inX = px + viewport.scrollLeft - stage.offsetLeft;
            const inY = py + viewport.scrollTop - stage.offsetTop;
            const fx = inX / (stage.offsetWidth || 1);
            const fy = inY / (stage.offsetHeight || 1);
            zoom = next;
            apply();
            viewport.scrollLeft = stage.offsetLeft + fx * stage.offsetWidth - px;
            viewport.scrollTop = stage.offsetTop + fy * stage.offsetHeight - py;
          };
          viewport.addEventListener(
            "wheel",
            (ev) => {
              if (requireCtrl && !(ev.ctrlKey || ev.metaKey)) return;
              ev.preventDefault();
              zoomTo(zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), ev.clientX, ev.clientY);
            },
            { passive: false },
          );
          viewport.addEventListener("dblclick", () => {
            zoom = 1;
            apply();
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
          });
          return {
            zoomBy: (f) => zoomTo(zoom * f),
            reset: () => {
              zoom = 1;
              apply();
              viewport.scrollLeft = 0;
              viewport.scrollTop = 0;
            },
          };
        };

        /* ---------------- 全屏看图 ---------------- */
        let openOverlay = null;
        const openFullscreen = (svgEl, source, hash) => {
          if (openOverlay) openOverlay.close();
          const pal = PALETTE;
          const overlay = document.createElement("div");
          overlay.style.cssText =
            "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
            `background:${pal.overlay};backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:24px;`;
          const inner = document.createElement("div");
          inner.style.cssText =
            `background:${pal.card};border-radius:16px;padding:26px;position:relative;cursor:grab;` +
            `max-width:92vw;max-height:92vh;overflow:auto;box-shadow:${pal.shadowLg};`;
          const stage = document.createElement("div");
          stage.style.cssText = "width:max-content;max-width:100%;margin:0 auto;";
          stage.innerHTML = svgEl.outerHTML;
          const svg = stage.querySelector("svg");
          if (svg) {
            const vb = svg.viewBox && svg.viewBox.baseVal;
            const w = vb && vb.width ? Math.round(vb.width) : 0;
            svg.style.cssText = w ? `width:${w}px;height:auto;display:block;` : "display:block;height:auto;";
          }
          inner.appendChild(stage);

          // 底部悬浮工具条（胶囊形）
          const zoomLabel = document.createElement("span");
          zoomLabel.style.cssText =
            `min-width:52px;text-align:center;font-size:12px;color:${pal.text};` +
            "font-variant-numeric:tabular-nums;";
          zoomLabel.textContent = "100%";
          const toolbar = document.createElement("div");
          toolbar.style.cssText =
            "position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:2;" +
            `display:flex;align-items:center;gap:3px;padding:5px 8px;border-radius:999px;` +
            `background:${pal.card};border:1px solid ${pal.border};box-shadow:${pal.shadowMd};`;
          const btnOut = iconButton(T.zoomOut, ICON_MINUS, 28, true);
          const btnIn = iconButton(T.zoomIn, ICON_PLUS, 28, true);
          const btnFit = iconButton(T.zoomFit, ICON_FIT, 28, true);
          const btnPng = iconButton(T.downloadPng, ICON_IMAGE, 28, true);
          const tsep = () => {
            const s = document.createElement("div");
            s.style.cssText = `width:1px;height:18px;background:${pal.border};margin:0 4px;`;
            return s;
          };
          toolbar.appendChild(btnOut);
          toolbar.appendChild(zoomLabel);
          toolbar.appendChild(btnIn);
          toolbar.appendChild(tsep());
          toolbar.appendChild(btnFit);
          toolbar.appendChild(tsep());
          toolbar.appendChild(btnPng);
          inner.appendChild(toolbar);

          const naturalW = (svg && svg.viewBox && svg.viewBox.baseVal.width) || (svg && svg.clientWidth) || 0;
          const zoomApi = attachZoom(inner, stage, naturalW, false, (z) => {
            zoomLabel.textContent = `${Math.round(z * 100)}%`;
          });
          if (zoomApi) {
            btnIn.addEventListener("click", () => zoomApi.zoomBy(1.25));
            btnOut.addEventListener("click", () => zoomApi.zoomBy(1 / 1.25));
            btnFit.addEventListener("click", () => zoomApi.reset());
          }
          btnPng.addEventListener("click", async () => {
            try {
              const png = await buildPngBlob(source, cacheKeyOf(hash));
              triggerDownload(png, `mermaid-${hash}.png`);
            } catch {
              triggerDownload(svgBlobOf(svgEl), `mermaid-${hash}.svg`);
              toast(T.pngFailed);
            }
          });

          // 拖拽平移
          let dragging = false;
          let sx = 0;
          let sy = 0;
          let sl = 0;
          let st = 0;
          const onMove = (ev) => {
            if (!dragging) return;
            inner.scrollLeft = sl - (ev.clientX - sx);
            inner.scrollTop = st - (ev.clientY - sy);
          };
          const onUp = () => {
            dragging = false;
            inner.style.cursor = "grab";
          };
          inner.addEventListener("mousedown", (ev) => {
            if (ev.target.closest("button")) return;
            dragging = true;
            sx = ev.clientX;
            sy = ev.clientY;
            sl = inner.scrollLeft;
            st = inner.scrollTop;
            inner.style.cursor = "grabbing";
            ev.preventDefault();
          });
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);

          overlay.appendChild(inner);
          const close = () => {
            document.removeEventListener("keydown", onKey, true);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            overlay.remove();
            openOverlay = null;
          };
          const onKey = (ev) => {
            if (ev.key === "Escape") {
              ev.stopPropagation();
              close();
            } else if (ev.key === "+" || ev.key === "=") {
              ev.preventDefault();
              zoomApi && zoomApi.zoomBy(1.25);
            } else if (ev.key === "-" || ev.key === "_") {
              ev.preventDefault();
              zoomApi && zoomApi.zoomBy(1 / 1.25);
            } else if (ev.key === "0") {
              ev.preventDefault();
              zoomApi && zoomApi.reset();
            }
          };
          overlay.addEventListener("click", (ev) => {
            if (ev.target === overlay) close();
          });
          const btnClose = iconButton(T.close, ICON_CLOSE);
          btnClose.style.position = "absolute";
          btnClose.style.top = "14px";
          btnClose.style.right = "14px";
          btnClose.addEventListener("click", close);
          inner.appendChild(btnClose);
          document.addEventListener("keydown", onKey, true);
          document.body.appendChild(overlay);
          openOverlay = { close };
        };

        /* ---------------- 剪贴板 ---------------- */
        const copyText = async (text) => {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.cssText = "position:fixed;opacity:0;";
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try {
              ok = document.execCommand("copy");
            } catch {
              /* ignore */
            }
            ta.remove();
            return ok;
          }
        };

        const copyImage = async (source, hash) => {
          try {
            const png = await buildPngBlob(source, cacheKeyOf(hash));
            await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
            toast(T.imageCopied);
          } catch {
            toast(T.copyFailed);
          }
        };

        /* ---------------- 渲染失败横幅 ---------------- */
        const showRenderError = (block) => {
          const content = contentOf(block);
          if (!content) return;
          const banner = document.createElement("div");
          banner.className = "mmdr-error";
          banner.style.cssText =
            "display:flex;align-items:center;gap:8px;padding:8px 12px;margin:6px 0 8px;" +
            `border-radius:10px;background:${PALETTE.dangerBg};color:${PALETTE.dangerText};` +
            "font-size:12.5px;line-height:1.5;";
          const glyph = document.createElement("span");
          glyph.innerHTML = ICON_WARN;
          glyph.style.cssText = "display:inline-flex;flex:none;";
          const text = document.createElement("span");
          text.textContent = T.renderError;
          text.style.cssText = "flex:1;";
          const retry = document.createElement("button");
          retry.type = "button";
          retry.style.cssText =
            `display:inline-flex;align-items:center;gap:5px;border:1px solid ${PALETTE.dangerText};` +
            "background:transparent;color:inherit;font-family:inherit;font-size:12px;cursor:pointer;" +
            "padding:3px 12px;border-radius:999px;transition:background .12s ease;";
          const rglyph = document.createElement("span");
          rglyph.innerHTML = ICON_RETRY;
          rglyph.style.cssText = "display:inline-flex;";
          const rtext = document.createElement("span");
          rtext.textContent = T.retry;
          retry.appendChild(rglyph);
          retry.appendChild(rtext);
          retry.addEventListener("mouseenter", () => {
            retry.style.background = "rgba(127,127,127,.14)";
          });
          retry.addEventListener("mouseleave", () => {
            retry.style.background = "transparent";
          });
          retry.addEventListener("click", () => {
            banner.remove();
            delete block.dataset.mmdrState;
            delete block.dataset.mmdrHash;
            delete block.dataset.mmdrV;
            process(block);
          });
          banner.appendChild(glyph);
          banner.appendChild(text);
          banner.appendChild(retry);
          block.insertBefore(banner, content);
        };

        /* ---------------- 块渲染 ---------------- */
        const renderBlock = async (block, source, hash) => {
          try {
            const svg = await renderToMarkup(source, false, false);
            if (!block.isConnected) return;
            const content = contentOf(block);
            if (!content || sourceOf(block) !== source) {
              delete block.dataset.mmdrState;
              return;
            }

            const root = document.createElement("div");
            root.className = "mmdr-root";
            root.style.cssText = "position:relative;padding:4px 2px 2px;";

            const canvas = document.createElement("div");
            canvas.className = "mmdr-canvas";
            canvas.style.cssText = "overflow:auto;max-width:100%;";
            const stage = document.createElement("div");
            stage.style.cssText = "width:max-content;max-width:100%;margin:0 auto;";
            stage.innerHTML = svg;
            canvas.appendChild(stage);
            const svgEl = stage.querySelector("svg");
            if (svgEl) svgEl.setAttribute("role", "img");
            let naturalW = 0;
            if (svgEl) {
              const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
              naturalW = (vb && vb.width) || svgEl.clientWidth || 0;
              svgEl.style.cssText =
                `display:block;margin:0 auto;height:auto;` +
                (naturalW ? `width:${Math.round(naturalW)}px;` : "width:auto;") +
                "max-width:100%;";
            }

            // 悬停角标：缩放比例 + 全屏 + 更多菜单
            const actions = document.createElement("div");
            actions.className = "mmdr-actions";
            actions.style.cssText =
              "position:absolute;top:2px;right:2px;display:flex;align-items:center;gap:6px;" +
              "opacity:0;transition:opacity .12s ease;z-index:5;";
            const zoomChip = document.createElement("span");
            zoomChip.style.cssText =
              `font-size:11px;color:${PALETTE.text2};background:${PALETTE.card};` +
              `border:1px solid ${PALETTE.border};border-radius:999px;padding:2px 8px;` +
              "font-variant-numeric:tabular-nums;display:none;";
            const btnExpand = iconButton(T.fullscreen, ICON_EXPAND);
            const btnMore = iconButton(T.moreActions, ICON_MORE);
            btnMore.setAttribute("aria-haspopup", "menu");
            btnMore.setAttribute("aria-expanded", "false");
            actions.appendChild(zoomChip);
            actions.appendChild(btnExpand);
            actions.appendChild(btnMore);

            const menu = document.createElement("div");
            menu.className = "mmdr-menu";
            menu.setAttribute("role", "menu");
            menu.style.cssText =
              "position:absolute;top:34px;right:2px;min-width:212px;z-index:6;display:none;" +
              `background:${PALETTE.card};color:${PALETTE.text};border:1px solid ${PALETTE.border};` +
              `border-radius:12px;box-shadow:${PALETTE.shadowMd};padding:6px;` +
              "transition:opacity .12s ease,transform .12s ease;";

            const itemCopy = menuItem(T.copyCode, ICON_COPY);
            itemCopy.addEventListener("click", () => {
              closeMenu();
              copyText(source);
            });
            const itemCopyImage = menuItem(T.copyImage, ICON_COPY_IMAGE);
            itemCopyImage.addEventListener("click", () => {
              closeMenu();
              copyImage(source, hash);
            });
            const itemPng = menuItem(T.downloadPng, ICON_IMAGE);
            itemPng.addEventListener("click", async () => {
              closeMenu();
              try {
                const png = await buildPngBlob(source, cacheKeyOf(hash));
                triggerDownload(png, `mermaid-${hash}.png`);
              } catch {
                triggerDownload(svgBlobOf(svgEl), `mermaid-${hash}.svg`);
                toast(T.pngFailed);
              }
            });
            const itemSvg = menuItem(T.downloadSvg, ICON_DOWNLOAD);
            itemSvg.addEventListener("click", () => {
              closeMenu();
              triggerDownload(svgBlobOf(svgEl), `mermaid-${hash}.svg`);
            });
            const rowScale = optionRow(
              T.scale,
              [
                { label: "1x", value: 1 },
                { label: "2x", value: 2 },
                { label: "3x", value: 3 },
              ],
              () => exportPrefs.scale,
              (v) => {
                exportPrefs.scale = v;
                saveExportPrefs();
              },
            );
            const rowBg = optionRow(
              T.background,
              [
                { label: T.bgWhite, value: false },
                { label: T.bgTransparent, value: true },
              ],
              () => exportPrefs.transparent,
              (v) => {
                exportPrefs.transparent = v;
                saveExportPrefs();
              },
            );
            const itemToggle = menuItem(T.toggleSource, ICON_CODE);
            let showingDiagram = true;
            const syncToggle = () => {
              canvas.style.display = showingDiagram ? "" : "none";
              if (showingDiagram) content.style.display = "none";
              else content.style.removeProperty("display");
              itemToggle.lastChild.textContent = showingDiagram ? T.toggleSource : T.toggleDiagram;
            };
            itemToggle.addEventListener("click", () => {
              closeMenu();
              showingDiagram = !showingDiagram;
              syncToggle();
            });
            syncToggle();

            menu.appendChild(itemCopy);
            menu.appendChild(itemCopyImage);
            menu.appendChild(itemPng);
            menu.appendChild(itemSvg);
            menu.appendChild(menuSeparator());
            menu.appendChild(rowScale);
            menu.appendChild(rowBg);
            menu.appendChild(menuSeparator());
            menu.appendChild(itemToggle);

            // 菜单键盘导航
            const menuItems = () => [...menu.querySelectorAll('button[role="menuitem"]')];
            menu.addEventListener("keydown", (ev) => {
              const items = menuItems();
              const idx = items.indexOf(document.activeElement);
              if (ev.key === "ArrowDown") {
                ev.preventDefault();
                items[(idx + 1 + items.length) % items.length]?.focus();
              } else if (ev.key === "ArrowUp") {
                ev.preventDefault();
                items[(idx - 1 + items.length) % items.length]?.focus();
              } else if (ev.key === "Escape") {
                ev.preventDefault();
                ev.stopPropagation();
                closeMenu();
                btnMore.focus();
              }
            });

            let menuOpen = false;
            const openMenu = () => {
              menu.style.display = "block";
              menu.style.opacity = "0";
              menu.style.transform = "translateY(-4px)";
              window.requestAnimationFrame(() => {
                menu.style.opacity = "1";
                menu.style.transform = "translateY(0)";
              });
              menuOpen = true;
              btnMore.setAttribute("aria-expanded", "true");
              root.__mmdrOutside = (ev) => {
                if (!root.contains(ev.target)) closeMenu();
              };
              document.addEventListener("click", root.__mmdrOutside, true);
              window.setTimeout(() => menuItems()[0]?.focus(), 30);
            };
            const closeMenu = () => {
              menu.style.display = "none";
              menuOpen = false;
              btnMore.setAttribute("aria-expanded", "false");
              document.removeEventListener("click", root.__mmdrOutside, true);
              if (!root.__mmdrHover) actions.style.opacity = "0";
            };

            btnExpand.addEventListener("click", () => {
              closeMenu();
              openFullscreen(svgEl, source, hash);
            });
            btnMore.addEventListener("click", (ev) => {
              ev.stopPropagation();
              if (menuOpen) closeMenu();
              else {
                prefetchExport(source, hash); // 打开菜单即预生成 PNG
                openMenu();
              }
            });

            // 悬停显隐 + 悬停预热
            root.__mmdrHover = false;
            root.addEventListener("mouseenter", () => {
              root.__mmdrHover = true;
              actions.style.opacity = "1";
              prefetchExport(source, hash);
            });
            root.addEventListener("mouseleave", () => {
              root.__mmdrHover = false;
              if (!menuOpen) actions.style.opacity = "0";
            });

            const zoomApi = attachZoom(canvas, stage, naturalW, true, (z) => {
              if (z === 1) {
                zoomChip.style.display = "none";
              } else {
                zoomChip.style.display = "";
                zoomChip.textContent = `${Math.round(z * 100)}%`;
              }
            });

            root.appendChild(actions);
            root.appendChild(menu);
            root.appendChild(canvas);
            block.insertBefore(root, content);
            block.dataset.mmdrState = "done";
            block.dataset.mmdrHash = hash;
            block.dataset.mmdrV = UI_VERSION;
            void zoomApi;
          } catch (err) {
            block.dataset.mmdrState = "error";
            block.dataset.mmdrHash = hash;
            block.dataset.mmdrV = UI_VERSION;
            showRenderError(block);
          }
        };

        const process = (block) => {
          const source = sourceOf(block);
          if (source === null) return;
          const hash = djb2(source);
          const state = block.dataset.mmdrState;
          if (state) {
            if (block.dataset.mmdrHash === hash && block.dataset.mmdrV === UI_VERSION) return;
            unprocess(block);
          }
          if (!source || !detectKind(source)) {
            block.dataset.mmdrState = "skip";
            block.dataset.mmdrHash = hash;
            block.dataset.mmdrV = UI_VERSION;
            return;
          }
          block.dataset.mmdrState = "pending";
          block.dataset.mmdrHash = hash;
          block.dataset.mmdrV = UI_VERSION;
          renderBlock(block, source, hash);
        };

        /* ---------------- 增量扫描 ---------------- */
        const dirty = new Set();
        let scanTimer = 0;
        const scheduleProcess = (block) => {
          dirty.add(block);
          if (scanTimer) return;
          scanTimer = window.setTimeout(() => {
            scanTimer = 0;
            const batch = [...dirty];
            dirty.clear();
            for (const b of batch) if (b.isConnected) process(b);
          }, 280);
        };
        const processNode = (node) => {
          if (!(node instanceof Element)) return;
          if (node.classList && node.classList.contains("md-code-block")) scheduleProcess(node);
          for (const b of node.querySelectorAll(".md-code-block")) scheduleProcess(b);
        };
        const fullScan = () => {
          sweepLegacy();
          for (const block of document.querySelectorAll(".md-code-block")) process(block);
        };

        /* ---------------- 主题切换 ---------------- */
        let themeTimer = 0;
        const checkTheme = () => {
          themeTimer = 0;
          const next = readPalette();
          if (next === PALETTE) return;
          PALETTE = next;
          themeGen++;
          exportCache.clear();
          mermaid.initialize(configFor(PALETTE, false));
          if (openOverlay) openOverlay.close();
          // 全量重画（图与 UI 都随主题重建）
          for (const block of document.querySelectorAll(".md-code-block[data-mmdr-state]")) unprocess(block);
          fullScan();
        };
        const scheduleThemeCheck = () => {
          if (themeTimer) return;
          themeTimer = window.setTimeout(checkTheme, 200);
        };

        /* ---------------- 观察器与资源清理 ---------------- */
        const observer = new MutationObserver((records) => {
          for (const rec of records) {
            if (rec.type === "childList") {
              for (const n of rec.addedNodes) processNode(n);
            } else if (rec.type === "characterData") {
              const blk = rec.target.parentElement && rec.target.parentElement.closest(".md-code-block");
              if (blk) scheduleProcess(blk);
            }
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });

        const themeObserver = new MutationObserver(scheduleThemeCheck);
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
        const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
        if (mq && mq.addEventListener) mq.addEventListener("change", scheduleThemeCheck);

        fullScan();

        ctx.effect(() => {
          observer.disconnect();
          themeObserver.disconnect();
          if (mq && mq.removeEventListener) mq.removeEventListener("change", scheduleThemeCheck);
          if (scanTimer) window.clearTimeout(scanTimer);
          if (themeTimer) window.clearTimeout(themeTimer);
          if (openOverlay) openOverlay.close();
          for (const node of document.querySelectorAll(".mmdr-root, .mmdr-overlay, .mmdr-error, .mmdr-holder, .mmdr-toolbar, .mmdr-toggle")) {
            node.remove();
          }
          for (const block of document.querySelectorAll(".md-code-block[data-mmdr-state]")) {
            const content = contentOf(block);
            if (content) content.style.removeProperty("display");
            delete block.dataset.mmdrState;
            delete block.dataset.mmdrHash;
            delete block.dataset.mmdrV;
          }
        });
      },
    };
  },
});
