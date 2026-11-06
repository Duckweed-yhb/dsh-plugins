window.__ModuleLoader__.load({ id: "@yhb/dsh-plugin-file-upload", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/client/index.tsx
  var import_react = __require("react");
  // 官方禁止 require @deepseek-ai/dsh-client-ui-primitives：该包随 DSH 版本变，
  // 组件抛一次整个槽位条目就崩（slot entry crashed）。本插件只用到 2 个图标 + 1 个
  // Tooltip，这里按同名接口自绘，下面 4 处调用点一行都不用动。
  var UPLOAD_ICON_PATH = {
    paperclip: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
    close: "M18 6L6 18M6 6l12 12"
  };
  var uploadIcon = (name, size) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: UPLOAD_ICON_PATH[name] })
  });
  var import_dsh_client_ui_primitives = {
    // 原来是有样式的浮层，这里退化成原生 title（包一层 span，避免布局变化）
    Tooltip: ({ label, children }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: label ?? "", children }),
    IconPaperclipOutlineRegular: ({ size = 14 } = {}) => uploadIcon("paperclip", size),
    IconCloseOutlineRegular: ({ size = 12 } = {}) => uploadIcon("close", size)
  };
  var import_jsx_runtime = __require("react/jsx-runtime");
  var SOURCE_NAME = "dsh-file-upload";
  var STYLE_TAG = "dsh-file-upload/style.css";
  var uploadMetaBySession = /* @__PURE__ */ new Map();
  var uploadSeq = 0;
  function metaFor(sessionId) {
    let m = uploadMetaBySession.get(sessionId);
    if (m === void 0) {
      m = /* @__PURE__ */ new Map();
      uploadMetaBySession.set(sessionId, m);
    }
    return m;
  }
  var metaListeners = /* @__PURE__ */ new Set();
  function subscribeMeta(listener) {
    metaListeners.add(listener);
    return () => {
      metaListeners.delete(listener);
    };
  }
  function notifyMeta() {
    for (const listener of metaListeners) listener();
  }
  var uploadError = null;
  var errorSeq = 0;
  var errorListeners = /* @__PURE__ */ new Set();
  function subscribeErrors(listener) {
    errorListeners.add(listener);
    return () => {
      errorListeners.delete(listener);
    };
  }
  function setUploadError(text) {
    uploadError = { seq: ++errorSeq, text };
    for (const listener of errorListeners) listener(uploadError);
  }
  function clearUploadError() {
    uploadError = null;
    for (const listener of errorListeners) listener(uploadError);
  }
  function badgeStyle(name) {
    const ext = name.slice(name.lastIndexOf(".") + 1).toUpperCase().slice(0, 4);
    const lower = ext.toLowerCase();
    if (lower === "pdf") return { bg: "#C93B2E", ext: "PDF" };
    if (lower === "docx" || lower === "doc") return { bg: "#2B579A", ext: "DOC" };
    if (lower === "xlsx" || lower === "xls") return { bg: "#217346", ext: "XLS" };
    if (lower === "csv" || lower === "tsv") return { bg: "#217346", ext: "CSV" };
    if (lower === "txt" || lower === "md" || lower === "markdown") return { bg: "#757575", ext: "TXT" };
    if (lower === "zip") return { bg: "#7A5BB0", ext: "ZIP" };
    if (lower === "json" || lower === "jsonl") return { bg: "#B8860B", ext: "JSON" };
    if (lower === "png" || lower === "jpg" || lower === "jpeg" || lower === "gif" || lower === "webp") return { bg: "#2E7D6B", ext: "IMG" };
    return { bg: "#5B7DB1", ext: ext === "" ? "FILE" : ext };
  }
  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
  function cardCaption(meta) {
    if (meta.status === "uploading") return meta.progress === void 0 ? "\u4E0A\u4F20\u4E2D\u2026" : `${Math.round(meta.progress * 100)}%`;
    if (meta.status === "error") return "\u4E0A\u4F20\u5931\u8D25";
    return formatBytes(meta.bytes);
  }
  function injectCss() {
    if (typeof document === "undefined") return () => void 0;
    if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`) !== null) return () => void 0;
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-file-upload";
    tag.dataset.pluginCss = STYLE_TAG;
    tag.textContent = `
.dsh-upload-btn{border:none;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);cursor:pointer;border-radius:6px;padding:4px;display:inline-flex;align-items:center;justify-content:center;line-height:0}
.dsh-upload-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary,currentColor)}
.dsh-upload-btn:disabled{opacity:.45;cursor:default}
.dsh-upload-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto 6px;padding:0 var(--dsh-composer-dock-inset);display:flex;flex-wrap:wrap;gap:8px;flex:none}
.dsh-upload-card{position:relative;flex-direction:column;align-items:center;gap:5px;width:88px;flex:none;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.08)));border-radius:12px;padding:12px 8px 9px;box-shadow:var(--dsw-shadow-lv1,0 1px 2px rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,inherit)}
.dsh-upload-badge{width:44px;height:56px;border-radius:6px;color:#fff;font-size:12px;font-weight:700;font-family:var(--ds-font-family-code,monospace);display:inline-flex;align-items:center;justify-content:center;letter-spacing:.5px;flex:none;box-shadow:inset 0 -10px 14px rgba(0,0,0,.14),inset 0 10px 12px rgba(255,255,255,.16)}
.dsh-upload-name{width:100%;font-size:12px;line-height:16px;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all}
.dsh-upload-size{color:var(--dsw-alias-label-tertiary,inherit);font-size:10.5px;flex:none}
.dsh-upload-progress{width:100%;height:3px;border-radius:2px;overflow:hidden;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}
.dsh-upload-progress-fill{height:100%;border-radius:2px;background:var(--dsw-alias-border-accent,rgba(99,132,255,.55));transition:width .12s ease}
.dsh-upload-card-error .dsh-upload-size{color:var(--dsw-alias-state-error-primary,#d86161)}
.dsh-upload-remove{border:none;background:transparent;color:var(--dsw-alias-label-tertiary,inherit);cursor:pointer;padding:2px;border-radius:4px;display:inline-flex;line-height:0;flex:none}
.dsh-upload-remove:hover{color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.dsh-upload-card>.dsh-upload-remove{position:absolute;top:4px;right:4px}
.dsh-upload-error{display:inline-flex;align-items:center;gap:8px;max-width:100%;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-alias-interactive-bg-hover-danger,rgba(216,97,97,.14));color:var(--dsw-alias-state-error-primary,#d86161);border-radius:10px;padding:6px 8px 6px 10px;font-size:13px}
.dsh-upload-error-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
.dsh-upload-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;pointer-events:none;background:color-mix(in srgb,var(--dsw-alias-surface-1,#101014) 72%,transparent);backdrop-filter:blur(2px);opacity:0;transition:opacity .12s ease}
.dsh-upload-overlay.active{opacity:1}
.dsh-upload-overlay-box{border:2px dashed var(--dsw-alias-border-accent,rgba(99,132,255,.55));border-radius:16px;padding:28px 44px;color:var(--dsw-alias-label-primary,inherit);font-size:15px;display:flex;flex-direction:column;align-items:center;gap:8px;background:var(--dsw-specific-input-major,rgba(127,127,127,.08))}
.dsh-upload-overlay-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,inherit)}
`;
    document.head.appendChild(tag);
    return () => tag.remove();
  }
  function httpErrorText(status) {
    if (status === 413) return "\u6587\u4EF6\u8D85\u8FC7\u5927\u5C0F\u9650\u5236";
    if (status === 415) return "\u6587\u4EF6\u7C7B\u578B\u4E0D\u88AB\u5141\u8BB8";
    if (status === 403) return "\u4F1A\u8BDD\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u91CD\u8BD5";
    if (status === 429) return "\u4E0A\u4F20\u592A\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5";
    return `HTTP ${status}`;
  }
  var UploadCancelled = class extends Error {
    constructor() {
      super("upload cancelled");
      this.name = "UploadCancelled";
    }
  };
  function postUpload(file, sessionId, relPath, controller, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const onAbort = () => xhr.abort();
      controller.signal.addEventListener("abort", onAbort);
      const settle = () => controller.signal.removeEventListener("abort", onAbort);
      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      if (relPath !== void 0) xhr.setRequestHeader("x-file-relpath", encodeURIComponent(relPath));
      xhr.setRequestHeader("x-session-id", sessionId);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded, event.total);
      };
      xhr.onabort = () => {
        settle();
        reject(new UploadCancelled());
      };
      xhr.onerror = () => {
        settle();
        reject(new Error(`${file.name}: \u7F51\u7EDC\u9519\u8BEF\uFF0C\u4E0A\u4F20\u5931\u8D25`));
      };
      xhr.onload = () => {
        settle();
        if (xhr.status < 200 || xhr.status >= 300) {
          let detail = httpErrorText(xhr.status);
          try {
            const payload2 = JSON.parse(xhr.responseText);
            if (typeof payload2.error === "string") detail = payload2.error;
          } catch {
          }
          reject(new Error(`${file.name}: ${detail}`));
          return;
        }
        let payload;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        if (typeof payload.path !== "string") {
          reject(new Error("missing path in response"));
          return;
        }
        resolve({ ...payload, path: payload.path });
      };
      if (controller.signal.aborted) onAbort();
      else xhr.send(file);
    });
  }
  async function uploadFile(actx, file, sessionId) {
    const conversation = actx.get("conversation");
    if (conversation === void 0) throw new Error("conversation service unavailable");
    const input = conversation.input.for(actx);
    const relPath = file.relPath;
    const cardKey = `__upload__:${++uploadSeq}`;
    const cards = metaFor(sessionId);
    const controller = new AbortController();
    const card = {
      name: file.name,
      bytes: file.size,
      label: file.name.slice(file.name.lastIndexOf(".") + 1).toUpperCase(),
      status: "uploading",
      progress: 0,
      abort: () => controller.abort()
    };
    cards.set(cardKey, card);
    notifyMeta();
    let payload;
    try {
      payload = await postUpload(file, sessionId, relPath, controller, (loaded, total) => {
        card.progress = Math.min(1, loaded / total);
        notifyMeta();
      });
    } catch (err) {
      if (err instanceof UploadCancelled) {
        cards.delete(cardKey);
      } else {
        card.status = "error";
        card.error = err instanceof Error ? err.message : String(err);
        card.progress = void 0;
        card.abort = void 0;
      }
      notifyMeta();
      throw err;
    }
    const name = payload.name ?? file.name;
    const ref = payload.relativePath !== void 0 && payload.relativePath !== "" ? payload.relativePath : payload.path;
    card.status = "ready";
    card.progress = void 0;
    card.abort = void 0;
    card.name = name;
    card.bytes = payload.bytes ?? file.size;
    card.label = payload.label ?? name.slice(name.lastIndexOf(".") + 1).toUpperCase();
    card.absolutePath = payload.path;
    if (payload.relativePath !== void 0) card.relativePath = payload.relativePath;
    if (file.type.startsWith("image/")) card.previewUrl = URL.createObjectURL(file);
    cards.delete(cardKey);
    cards.set(ref, card);
    notifyMeta();
    clearUploadError();
    if (payload.sniffedType === "image" && payload.imageDescription !== void 0) {
      const text = `[\u56FE\u7247: ${name}] \u56FE\u7247\u8BB2\u89E3:
${payload.imageDescription}`;
      const before = input.state.getSnapshot();
      actx.emit("slash/input-insert-text", {
        text,
        span: { start: before.draft.length, end: before.draft.length, draftRev: before.draftRev }
      });
    }
    const state = input.state.getSnapshot();
    actx.emit("slash/input-insert-reference", {
      reference: {
        source: SOURCE_NAME,
        ref,
        label: name,
        clipboardText: `@${ref}`
      },
      span: {
        start: state.draft.length,
        end: state.draft.length,
        draftRev: state.draftRev
      }
    });
    return ref;
  }
  async function collectDroppedFiles(items) {
    if (items === null) return [];
    const files = [];
    const walk = async (entry, prefix) => {
      if (entry === null) return;
      if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve));
        if (file !== null) {
          if (prefix !== "") {
            const rel = `${prefix}/${file.name}`;
            Object.defineProperty(file, "relPath", { value: rel });
          }
          files.push(file);
        }
        return;
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        while (true) {
          const entries = await new Promise((resolve) => reader.readEntries(resolve));
          if (entries.length === 0) break;
          for (const child of entries) await walk(child, prefix === "" ? entry.name : `${prefix}/${entry.name}`);
        }
      }
    };
    const jobs = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry !== null) {
        jobs.push(walk(entry, ""));
      } else {
        const f = item.getAsFile();
        if (f !== null) files.push(f);
      }
    }
    await Promise.all(jobs);
    return files;
  }
  function filesFromClipboard(e) {
    const items = e.clipboardData?.items;
    const files = [];
    if (items !== void 0) {
      for (let i = 0; i < items.length; i += 1) {
        const f = items[i].getAsFile();
        if (f !== null) files.push(f);
      }
    }
    return files;
  }
  async function attachFiles(actx, files, sessionId) {
    for (const file of files) {
      try {
        await uploadFile(actx, file, sessionId);
      } catch (err) {
        if (err instanceof UploadCancelled) continue;
        setUploadError(err instanceof Error ? err.message : String(err));
      }
    }
  }
  function UploadButton({ attach }) {
    const [busy, setBusy] = (0, import_react.useState)(false);
    const inputRef = (0, import_react.useRef)(null);
    const pick = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.style.display = "none";
      document.body.appendChild(input);
      inputRef.current = input;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        input.remove();
        inputRef.current = null;
        if (files.length === 0) return;
        setBusy(true);
        void attach(files).finally(() => setBusy(false));
      };
      input.click();
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: busy ? "\u4E0A\u4F20\u4E2D\u2026" : "\u4E0A\u4F20\u6587\u4EF6", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsh-upload-btn", "aria-label": "\u4E0A\u4F20\u6587\u4EF6", disabled: busy, onClick: pick, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPaperclipOutlineRegular, { size: 14 }) }) });
  }
  function DragOverlay({ attach }) {
    const [active, setActive] = (0, import_react.useState)(false);
    const depth = (0, import_react.useRef)(0);
    (0, import_react.useEffect)(() => {
      const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
      const onDragEnter = (e) => {
        if (!hasFiles(e)) return;
        depth.current += 1;
        setActive(true);
      };
      const onDragOver = (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
      };
      const onDragLeave = (e) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      };
      const onDrop = (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setActive(false);
        void (async () => {
          const files = await collectDroppedFiles(e.dataTransfer?.items ?? null);
          if (files.length > 0) await attach(files);
        })();
      };
      const onPaste = (e) => {
        const files = filesFromClipboard(e);
        if (files.length > 0 && files.some((f) => f.type.startsWith("image/") || f.type !== "")) {
          e.preventDefault();
          void attach(files);
        }
      };
      document.addEventListener("dragenter", onDragEnter);
      document.addEventListener("dragover", onDragOver);
      document.addEventListener("dragleave", onDragLeave);
      document.addEventListener("drop", onDrop);
      document.addEventListener("paste", onPaste);
      return () => {
        document.removeEventListener("dragenter", onDragEnter);
        document.removeEventListener("dragover", onDragOver);
        document.removeEventListener("dragleave", onDragLeave);
        document.removeEventListener("drop", onDrop);
        document.removeEventListener("paste", onPaste);
      };
    }, [attach]);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-upload-overlay${active ? " active" : ""}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-upload-overlay-box", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: "\u677E\u5F00\u4EE5\u6DFB\u52A0\u6587\u4EF6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-upload-overlay-hint", children: "\u6587\u4EF6/\u6587\u4EF6\u5939\u5C06\u4E0A\u4F20\u5230\u5F53\u524D\u4F1A\u8BDD,agent \u53EF\u8BFB\u53D6\u5176\u5185\u5BB9" })
    ] }) });
  }
  function UploadDock({ attach, sessionId }) {
    const [, setMetaVersion] = (0, import_react.useState)(0);
    const [error, setError] = (0, import_react.useState)(null);
    (0, import_react.useEffect)(() => {
      const offs = [
        subscribeErrors((next) => {
          setError(next);
          setMetaVersion((v) => v + 1);
        }),
        subscribeMeta(() => setMetaVersion((v) => v + 1))
      ];
      return () => {
        for (const off of offs) off();
      };
    }, []);
    (0, import_react.useEffect)(() => {
      const cards = metaFor(sessionId);
      return () => {
        for (const [key, meta] of Array.from(cards.entries())) {
          if (meta.status !== "uploading") continue;
          meta.abort?.();
          cards.delete(key);
        }
      };
    }, [sessionId]);
    const removeCard = (ref) => {
      const meta = metaFor(sessionId).get(ref);
      metaFor(sessionId).delete(ref);
      notifyMeta();
      if (meta === void 0) return;
      if (meta.status === "uploading") {
        meta.abort?.();
        return;
      }
      if (meta.status !== "ready" || meta.absolutePath === void 0) return;
      void fetch("/api/upload", {
        method: "DELETE",
        headers: {
          "x-session-id": sessionId,
          "x-file-path": meta.absolutePath
        }
      }).catch(() => void 0);
    };
    const entries = Array.from(metaFor(sessionId).entries());
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      entries.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-upload-dock", children: entries.map(([ref, meta]) => {
        const badge = badgeStyle(meta.name);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `dsh-upload-card${meta.status === "error" ? " dsh-upload-card-error" : ""}`, children: [
          meta.previewUrl !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "img",
            {
              src: meta.previewUrl,
              alt: meta.name,
              className: "dsh-upload-thumb",
              style: { width: 44, height: 44, objectFit: "cover", borderRadius: 6 }
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-upload-badge", style: { background: badge.bg }, children: badge.ext }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-upload-name", title: meta.error ?? meta.name, children: meta.name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-upload-size", children: cardCaption(meta) }),
          meta.status === "uploading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-upload-progress", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "div",
            {
              className: "dsh-upload-progress-fill",
              style: { width: `${Math.round((meta.progress ?? 0) * 100)}%` }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: meta.status === "uploading" ? "\u53D6\u6D88\u4E0A\u4F20" : "\u79FB\u9664", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-upload-remove",
              "aria-label": meta.status === "uploading" ? "\u53D6\u6D88\u4E0A\u4F20" : "\u79FB\u9664",
              onClick: () => removeCard(ref),
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutlineRegular, { size: 12 })
            }
          ) })
        ] }, ref);
      }) }),
      error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-upload-error", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-upload-error-text", children: error.text }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-upload-remove",
            "aria-label": "\u5173\u95ED",
            onClick: () => setError(null),
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseOutlineRegular, { size: 12 })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DragOverlay, { attach })
    ] });
  }
  function apply(ctx) {
    ctx.effect(() => injectCss());
    ctx.effect(
      () => ctx.inputTriggers.registerSource({
        trigger: "@",
        name: SOURCE_NAME,
        // Codex-style: pick an already-uploaded file by its relative path.
        candidates: async (projection) => {
          const metas = uploadMetaBySession.get(projection.sessionId);
          if (metas === void 0) return [];
          return Array.from(metas.entries()).filter(([, meta]) => meta.status === "ready").map(([ref, meta]) => ({
            name: ref,
            description: `${meta.label} \xB7 ${formatBytes(meta.bytes)}`,
            icon: "\u{1F4CE}"
          }));
        },
        onPick: (pick) => {
          const metas = uploadMetaBySession.get(pick.session.sessionId);
          const meta = metas?.get(pick.candidate.name);
          if (metas === void 0 || meta === void 0) return void 0;
          return {
            insert: {
              source: SOURCE_NAME,
              ref: pick.candidate.name,
              label: meta.name,
              clipboardText: `@${pick.candidate.name}`
            }
          };
        },
        codec: {
          clipboardText: (ref) => ref,
          serialize: async (ref) => ref
        }
      })
    );
    ctx.slots.inject(
      "conversation.input.left",
      () => ctx.slots.register(
        {
          name: "conversation.input.left",
          id: "dsh-file-upload-button",
          order: 0,
          inject: (sessionId) => ({
            attach: (files) => attachFiles(ctx.sessions.scope(sessionId), files, sessionId)
          })
        },
        UploadButton
      )
    );
    ctx.slots.inject(
      "conversation.input.dock",
      () => ctx.slots.register(
        {
          name: "conversation.input.dock",
          id: "dsh-file-upload-dock",
          order: 5,
          inject: (sessionId) => ({
            attach: (files) => attachFiles(ctx.sessions.scope(sessionId), files, sessionId)
          })
        },
        UploadDock
      )
    );
  }
  if (typeof module !== "undefined" && module !== null) {
    module.exports = {
      apply,
      inject: ["slots", "inputTriggers", "sessions"]
    };
  }
})();
return module.exports; } });
//# sourceMappingURL=client.js.map
