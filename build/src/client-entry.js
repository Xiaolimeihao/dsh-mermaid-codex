// client-entry.js — 构建入口：打包 mermaid 并注册 DSH client 模块
// 产物 client.js 由 esbuild 打包为单个 IIFE 脚本。
// 交互模仿 Codex：悬停显示右上角角标（全屏 + 更多菜单：复制为代码 / 下载图像 / 显示源码）。
// 样式全部走行内 style 属性 + JS 事件（页面 CSP 禁止内联 <style> 元素）。
import mermaid from "mermaid";

const MODULE_ID = "dsh-mermaid-codex";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  themeVariables: {
    primaryColor: "#dae8fc",
    primaryBorderColor: "#b7cdf2",
    primaryTextColor: "#1f4e9c",
    lineColor: "#9aa0a6",
    fontFamily: '"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif',
  },
});

// mermaid.detectType 的兜底正则（引擎缺失或异常时使用）
const FALLBACK_TYPE =
  /^\s*(graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie\s|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4\w+|sankey-beta|xychart-beta|block-beta|packet-beta|kanban|architecture-beta|radar-beta|treemap-beta)/;

function detectKind(source) {
  try {
    const kind = mermaid.detectType(source);
    if (kind) return kind;
  } catch {
    /* fall through */
  }
  return FALLBACK_TYPE.test(source) ? "fallback" : undefined;
}

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  return String(hash >>> 0);
}

// DOM 结构版本：升级 UI 后递增，让旧渲染结果强制重画，避免新旧界面残留叠加
const UI_VERSION = "6";

const ICON_EXPAND = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const ICON_MORE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`;

const C = {
  cardBg: "#ffffff",
  border: "#d7dbe0",
  text: "#1f2328",
  textSecondary: "#55595f",
  hoverBg: "#f1f3f5",
  shadow: "0 1px 2px rgba(0,0,0,.06)",
  menuShadow: "0 6px 18px rgba(0,0,0,.12)",
};

window.__ModuleLoader__.load({
  id: MODULE_ID,
  factory() {
    return {
      inject: [],
      apply(ctx) {
        let counter = 0;
        let chain = Promise.resolve();
        let scheduled = false;

        const contentOf = (block) => block.querySelector(":scope > [data-code-block-content]");
        const sourceOf = (block) => {
          const content = contentOf(block);
          return content ? (content.textContent ?? "").trim() : null;
        };

        const unprocess = (block) => {
          block.querySelector(":scope > .mmdr-root")?.remove();
          const content = contentOf(block);
          if (content) content.style.removeProperty("display");
          delete block.dataset.mmdrState;
          delete block.dataset.mmdrHash;
          delete block.dataset.mmdrV;
        };

        // 清扫历史版本的残留 DOM（旧版类名：mmdr-holder / mmdr-toolbar / mmdr-toggle）
        const sweepLegacy = () => {
          for (const stray of document.querySelectorAll(".mmdr-holder, .mmdr-toolbar, .mmdr-toggle")) {
            stray.remove();
          }
        };

        const ICON_COPY = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const ICON_IMAGE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
        const ICON_CODE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

        const iconButton = (title, icon) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.title = title;
          btn.setAttribute("aria-label", title);
          btn.innerHTML = icon;
          btn.style.cssText =
            "width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;" +
            `border:1px solid ${C.border};border-radius:8px;cursor:pointer;background:${C.cardBg};` +
            `color:${C.textSecondary};box-shadow:${C.shadow};padding:0;`;
          btn.addEventListener("mouseenter", () => {
            btn.style.background = C.hoverBg;
            btn.style.color = C.text;
          });
          btn.addEventListener("mouseleave", () => {
            btn.style.background = C.cardBg;
            btn.style.color = C.textSecondary;
          });
          return btn;
        };

        const menuItem = (label, icon) => {
          const item = document.createElement("button");
          item.type = "button";
          item.style.cssText =
            "display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:none;cursor:pointer;" +
            `background:transparent;color:${C.text};font-size:13px;line-height:1.6;` +
            "padding:6px 10px;border-radius:6px;font-family:inherit;white-space:nowrap;";
          const glyph = document.createElement("span");
          glyph.innerHTML = icon;
          glyph.style.cssText =
            "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;" +
            `color:${C.textSecondary};flex:none;`;
          const text = document.createElement("span");
          text.textContent = label;
          item.appendChild(glyph);
          item.appendChild(text);
          item.addEventListener("mouseenter", () => {
            item.style.background = C.hoverBg;
            glyph.style.color = C.text;
          });
          item.addEventListener("mouseleave", () => {
            item.style.background = "transparent";
            glyph.style.color = C.textSecondary;
          });
          return item;
        };

        const menuSeparator = () => {
          const sep = document.createElement("div");
          sep.style.cssText = `height:1px;background:${C.border};opacity:.6;margin:4px 6px;`;
          return sep;
        };

        const closeMenu = (root) => {
          root.__mmdrMenu.style.display = "none";
          root.__mmdrOpen = false;
          document.removeEventListener("click", root.__mmdrOutside, true);
          if (!root.__mmdrHover) root.__mmdrActions.style.opacity = "0";
        };
        const openMenu = (root) => {
          const menu = root.__mmdrMenu;
          menu.style.display = "block";
          menu.style.opacity = "0";
          window.requestAnimationFrame(() => {
            menu.style.opacity = "1";
          });
          root.__mmdrOpen = true;
          root.__mmdrActions.style.opacity = "1";
          root.__mmdrOutside = (ev) => {
            if (!root.contains(ev.target)) closeMenu(root);
          };
          document.addEventListener("click", root.__mmdrOutside, true);
        };

        // 以 viewBox 为准锁定 svg 自然宽度，防止 width:100% 拉伸巨大；
        // 二次样式化（全屏复用同一 svg）也不会丢失宽度。窄容器里等比缩小。
        // 返回自然宽度（px），供滚轮缩放使用。
        const styleSvg = (svgEl) => {
          if (!svgEl) return 0;
          let natural = 0;
          const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
          if (vb && vb.width) natural = vb.width;
          if (!natural) {
            const m = /(?:max-)?width:\s*([\d.]+)px/.exec(svgEl.getAttribute("style") || "");
            if (m) natural = parseFloat(m[1]);
          }
          if (!natural) natural = svgEl.clientWidth || 0;
          const widthCss = natural ? `width:${Math.round(natural)}px;` : "width:auto;";
          svgEl.style.cssText = `display:block;margin:0 auto;height:auto;${widthCss}max-width:100%;`;
          return natural;
        };

        // 滚轮缩放（光标锚点）+ 双击复原。
        // requireCtrl=true 时仅 Ctrl/⌘+滚轮缩放，普通滚轮留给页面滚动。
        const attachZoom = (viewport, stage, naturalW, requireCtrl) => {
          const svgEl = stage.querySelector("svg");
          if (!svgEl || !naturalW) return;
          let zoom = 1;
          const apply = () => {
            svgEl.style.width = `${Math.round(naturalW * zoom)}px`;
            const relaxed = zoom !== 1;
            svgEl.style.maxWidth = relaxed ? "none" : "100%";
            stage.style.maxWidth = relaxed ? "none" : "100%";
          };
          viewport.addEventListener(
            "wheel",
            (ev) => {
              if (requireCtrl && !(ev.ctrlKey || ev.metaKey)) return;
              ev.preventDefault();
              const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
              const next = Math.min(5, Math.max(0.25, zoom * factor));
              if (next === zoom) return;
              // 光标锚点：缩放前后光标下的图上点保持不动
              const rect = viewport.getBoundingClientRect();
              const cx = ev.clientX - rect.left;
              const cy = ev.clientY - rect.top;
              const inX = cx + viewport.scrollLeft - stage.offsetLeft;
              const inY = cy + viewport.scrollTop - stage.offsetTop;
              const fx = inX / (stage.offsetWidth || 1);
              const fy = inY / (stage.offsetHeight || 1);
              zoom = next;
              apply();
              viewport.scrollLeft = stage.offsetLeft + fx * stage.offsetWidth - cx;
              viewport.scrollTop = stage.offsetTop + fy * stage.offsetHeight - cy;
            },
            { passive: false },
          );
          viewport.addEventListener("dblclick", () => {
            zoom = 1;
            apply();
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
          });
        };

        const openFullscreen = (svgMarkup) => {
          const overlay = document.createElement("div");
          overlay.style.cssText =
            "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
            "background:rgba(15,18,20,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:24px;";
          const inner = document.createElement("div");
          inner.style.cssText =
            `background:${C.cardBg};border-radius:14px;padding:26px;position:relative;cursor:grab;` +
            "max-width:92vw;max-height:92vh;overflow:auto;box-shadow:0 24px 64px rgba(0,0,0,.3);";

          const stage = document.createElement("div");
          stage.style.cssText = "width:max-content;max-width:100%;margin:0 auto;";
          stage.innerHTML = svgMarkup;
          inner.appendChild(stage);
          const naturalW = styleSvg(stage.querySelector("svg"));
          attachZoom(inner, stage, naturalW, false); // 全屏：滚轮直接缩放

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
          };
          const onKey = (ev) => {
            if (ev.key === "Escape") {
              ev.stopPropagation();
              close();
            }
          };
          overlay.addEventListener("click", (ev) => {
            if (ev.target === overlay) close();
          });
          const btnClose = iconButton("关闭", ICON_CLOSE);
          btnClose.style.position = "absolute";
          btnClose.style.top = "12px";
          btnClose.style.right = "12px";
          btnClose.addEventListener("click", close);
          inner.appendChild(btnClose);
          document.addEventListener("keydown", onKey, true);
          document.body.appendChild(overlay);
        };

        const copySource = async (source) => {
          try {
            await navigator.clipboard.writeText(source);
          } catch {
            const ta = document.createElement("textarea");
            ta.value = source;
            ta.style.cssText = "position:fixed;opacity:0;";
            document.body.appendChild(ta);
            ta.select();
            try {
              document.execCommand("copy");
            } catch {
              /* ignore */
            }
            ta.remove();
          }
        };

        // 导出用的干净 SVG：恢复自然尺寸（不受当前缩放影响）。
        // 用 XMLSerializer 保证 XML 合规（HTML 的 outerHTML 会输出 &nbsp;、<br> 等
        // 非 XML 形式，导致作为图片加载时解析失败）。
        const cleanSvgMarkup = (svgEl) => {
          const clone = svgEl.cloneNode(true);
          const vb = clone.viewBox && clone.viewBox.baseVal;
          const w = vb && vb.width ? Math.round(vb.width) : 0;
          clone.style.cssText = w
            ? `width:${w}px;height:auto;display:block;`
            : "display:block;height:auto;";
          try {
            return new XMLSerializer().serializeToString(clone);
          } catch {
            return clone.outerHTML;
          }
        };

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

        // 失败时给出可见提示，不静默降级
        const notify = (text) => {
          const box = document.createElement("div");
          box.textContent = text;
          box.style.cssText =
            "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:10000;" +
            "background:#1f2328;color:#ffffff;font-size:12.5px;padding:8px 14px;" +
            "border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.25);";
          document.body.appendChild(box);
          window.setTimeout(() => box.remove(), 3200);
        };

        const downloadSvg = (svgEl, hash) => {
          const markup = cleanSvgMarkup(svgEl);
          triggerDownload(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }), `mermaid-${hash}.svg`);
        };

        // 三级加载：blob URL → data URL → createImageBitmap（逐步绕开 CSP/解析问题）
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

        // PNG 导出：SVG → 离屏 canvas 2x 栅格化；失败回退 SVG 并提示
        const downloadPng = async (svgEl, hash) => {
          const markup = cleanSvgMarkup(svgEl);
          const svgFallback = () => {
            triggerDownload(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }), `mermaid-${hash}.svg`);
            notify("PNG 导出失败，已改为下载 SVG");
          };
          try {
            const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
            const w = (vb && vb.width) || svgEl.clientWidth || 800;
            const h = (vb && vb.height) || svgEl.clientHeight || 600;
            const source = await loadSvgImage(markup);
            const scale = 2;
            const raster = document.createElement("canvas");
            raster.width = Math.round(w * scale);
            raster.height = Math.round(h * scale);
            const ctx = raster.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, raster.width, raster.height);
            ctx.drawImage(source, 0, 0, raster.width, raster.height);
            const png = await new Promise((resolve) => raster.toBlob(resolve, "image/png"));
            if (!png) throw new Error("png encode failed");
            triggerDownload(png, `mermaid-${hash}.png`);
          } catch {
            svgFallback();
          }
        };

        const render = async (block, source, hash) => {
          const id = `mmdr-${++counter}`;
          try {
            const { svg } = await mermaid.render(id, source);
            // 异步期间宿主可能重绘（流式更新），渲染前后一致性检查
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
            const naturalW = styleSvg(stage.querySelector("svg"));
            attachZoom(canvas, stage, naturalW, true);

            // 悬停角标：全屏 + 更多菜单（模仿 Codex）
            const actions = document.createElement("div");
            actions.className = "mmdr-actions";
            actions.style.cssText =
              "position:absolute;top:2px;right:2px;display:flex;gap:4px;" +
              "opacity:0;transition:opacity .12s ease;z-index:5;";

            const btnExpand = iconButton("全屏查看", ICON_EXPAND);
            btnExpand.addEventListener("click", () => {
              closeMenu(root);
              openFullscreen(canvas.querySelector("svg")?.outerHTML ?? svg);
            });

            const btnMore = iconButton("更多操作", ICON_MORE);
            btnMore.addEventListener("click", (ev) => {
              ev.stopPropagation();
              if (root.__mmdrOpen) closeMenu(root);
              else openMenu(root);
            });

            actions.appendChild(btnExpand);
            actions.appendChild(btnMore);

            const menu = document.createElement("div");
            menu.className = "mmdr-menu";
            menu.style.cssText =
              "position:absolute;top:32px;right:2px;min-width:156px;z-index:6;display:none;" +
              `background:${C.cardBg};color:${C.text};border:1px solid ${C.border};border-radius:10px;` +
              `box-shadow:${C.menuShadow};padding:5px;transition:opacity .12s ease;`;

            const itemCopy = menuItem("复制为代码", ICON_COPY);
            itemCopy.addEventListener("click", () => {
              closeMenu(root);
              copySource(source);
            });
            const itemPng = menuItem("下载 PNG", ICON_IMAGE);
            itemPng.addEventListener("click", () => {
              closeMenu(root);
              const el = canvas.querySelector("svg");
              if (el) downloadPng(el, hash);
            });
            const itemDownload = menuItem("下载 SVG", ICON_DOWNLOAD);
            itemDownload.addEventListener("click", () => {
              closeMenu(root);
              const el = canvas.querySelector("svg");
              if (el) downloadSvg(el, hash);
            });
            const itemToggle = menuItem("显示源码", ICON_CODE);
            menu.appendChild(itemCopy);
            menu.appendChild(itemPng);
            menu.appendChild(itemDownload);
            menu.appendChild(menuSeparator());
            menu.appendChild(itemToggle);

            // 图表 / 源码切换（入口常驻菜单，随时可切回）
            let showingDiagram = true;
            const sync = () => {
              canvas.style.display = showingDiagram ? "" : "none";
              if (showingDiagram) content.style.display = "none";
              else content.style.removeProperty("display");
              itemToggle.lastChild.textContent = showingDiagram ? "显示源码" : "显示图表";
            };
            itemToggle.addEventListener("click", () => {
              closeMenu(root);
              showingDiagram = !showingDiagram;
              sync();
            });
            sync();

            // 悬停显隐（JS 实现，替代 :hover 伪类）
            root.__mmdrActions = actions;
            root.__mmdrMenu = menu;
            root.__mmdrOpen = false;
            root.__mmdrHover = false;
            root.addEventListener("mouseenter", () => {
              root.__mmdrHover = true;
              actions.style.opacity = "1";
            });
            root.addEventListener("mouseleave", () => {
              root.__mmdrHover = false;
              if (!root.__mmdrOpen) actions.style.opacity = "0";
            });

            root.appendChild(actions);
            root.appendChild(menu);
            root.appendChild(canvas);
            block.insertBefore(root, content);
            block.dataset.mmdrState = "done";
            block.dataset.mmdrHash = hash;
            block.dataset.mmdrV = UI_VERSION;
          } catch (err) {
            // 语法错误等情况保留原代码块展示，不吞掉内容
            document.getElementById(`d${id}`)?.remove();
            document.getElementById(id)?.remove();
            block.dataset.mmdrState = "error";
            block.dataset.mmdrHash = hash;
            block.dataset.mmdrV = UI_VERSION;
          }
        };

        const process = (block) => {
          const source = sourceOf(block);
          if (source === null) return;
          const hash = djb2(source);
          const state = block.dataset.mmdrState;
          if (state) {
            if (block.dataset.mmdrHash === hash && block.dataset.mmdrV === UI_VERSION) return; // 无变化
            unprocess(block); // 内容或 UI 版本变了，重新评估
          }
          if (!source || !detectKind(source)) {
            block.dataset.mmdrState = "skip";
            block.dataset.mmdrHash = hash;
            return;
          }
          block.dataset.mmdrState = "pending";
          block.dataset.mmdrHash = hash;
          chain = chain.then(() => render(block, source, hash)).catch(() => {});
        };

        const scan = () => {
          sweepLegacy();
          for (const block of document.querySelectorAll(".md-code-block")) process(block);
        };

        const schedule = () => {
          if (scheduled) return;
          scheduled = true;
          window.setTimeout(() => {
            scheduled = false;
            scan();
          }, 300);
        };

        const observer = new MutationObserver(schedule);
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        schedule();

        ctx.effect(() => {
          observer.disconnect();
          for (const holder of document.querySelectorAll(".mmdr-root, .mmdr-overlay")) holder.remove();
          for (const block of document.querySelectorAll(".md-code-block[data-mmdr-state]")) {
            const content = contentOf(block);
            if (content) content.style.removeProperty("display");
            delete block.dataset.mmdrState;
            delete block.dataset.mmdrHash;
          }
        });
      },
    };
  },
});
