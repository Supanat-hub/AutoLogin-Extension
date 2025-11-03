/***** ===== AutoLogin: run ONCE per URL visit ===== *****/
const LOG = (...a) => console.log("%c[AutoLogin]", "color:#6ea8ff", ...a);
const WARN = (...a) => console.warn("[AutoLogin]", ...a);
const ERR = (...a) => console.error("[AutoLogin]", ...a);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const norm = s => String(s || "").replace(/\/+$/, "");


/* ---------- DOM helpers ---------- */
function isVisible(el) {
  if (!el) return false;
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  return cs.visibility !== "hidden" && cs.display !== "none" && r.width > 0 && r.height > 0;
}
async function waitFor(sel, timeout = 15000, interval = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const el = document.querySelector(sel);
    if (el) return el;
    await sleep(interval);
  }
  throw new Error(`Timeout waiting for ${sel}`);
}
async function waitForVisible(sel, timeout = 15000, interval = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) return el;
    await sleep(interval);
  }
  throw new Error(`Timeout waiting for visible ${sel}`);
}
async function safeClick(sel) {
  const el = await waitForVisible(sel);
  el.scrollIntoView({ block: "center", inline: "center" });
  await sleep(50);
  el.click();
}
function getNativeSetter() {
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  return d?.set || null;
}
const nativeSetValue = getNativeSetter();
function setInputValue(el, val) {
  if (nativeSetValue && el instanceof HTMLInputElement) nativeSetValue.call(el, val);
  else el.value = val;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// ---------- Runtime guards ----------
function extAlive() {
  return !!(window.chrome && chrome.runtime && chrome.runtime.id);
}

// ---------- Safe storage wrappers (MV3-friendly) ----------
async function safeSyncGet(keys) {
  if (!extAlive()) return {}; // context invalid / reloading
  try {
    // ใช้รูปแบบ promise ถ้าได้, ถ้าไม่ได้ fallback callback
    if (typeof chrome.storage.sync.get === "function" &&
        chrome.storage.sync.get.length === 1) {
      // promise-based (ไม่มี callback param)
      return await chrome.storage.sync.get(keys);
    }
    return await new Promise((res) => {
      chrome.storage.sync.get(keys, (r) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn("[AutoLogin] storage.get lastError:", err.message);
          res({});
        } else {
          res(r || {});
        }
      });
    });
  } catch (e) {
    console.warn("[AutoLogin] storage.get failed:", e?.message || e);
    return {};
  }
}

async function safeSyncSet(obj) {
  if (!extAlive()) return false;
  try {
    if (typeof chrome.storage.sync.set === "function" &&
        chrome.storage.sync.set.length === 1) {
      await chrome.storage.sync.set(obj);
      return true;
    }
    return await new Promise((res) => {
      chrome.storage.sync.set(obj, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn("[AutoLogin] storage.set lastError:", err.message);
          res(false);
        } else {
          res(true);
        }
      });
    });
  } catch (e) {
    console.warn("[AutoLogin] storage.set failed:", e?.message || e);
    return false;
  }
}

// ========== ENABLED SWITCH ==========
let __enabledCache = true;

// โหลดค่า enabled ครั้งแรก
async function loadEnabled() {
  const { enabled } = await safeSyncGet(['enabled']);
  __enabledCache = (enabled ?? true);
  return __enabledCache;
}

// subscribe เวลา popup เปลี่ยนค่า enabled
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.enabled) return;

  __enabledCache = changes.enabled.newValue ?? true;
  LOG('enabled changed ->', __enabledCache);

  // ถ้าเพิ่งเปิดกลับเป็น ON ให้ล้าง guard ของ URL ปัจจุบัน แล้วลอง autorun
  if (__enabledCache === true) {
    resetVisitGuardForCurrentHref();
    // รอ 1 ไมโครทิกให้ DOM/Rules พร้อม แล้วค่อยลอง autorun
    setTimeout(() => maybeAutoRunOnceForThisHref('toggle-on'), 0);
  }
});


async function isEnabled() {
  // ใช้ cache เพื่อลด I/O; ถ้ายังไม่เคยโหลด ให้โหลด
  if (typeof __enabledCache !== 'boolean') return loadEnabled();
  return __enabledCache;
}

/* ---------- rules ---------- */
function urlStartsWith(href, pattern) {
  if (pattern?.startsWith("regex:")) {
    try { return new RegExp(pattern.slice(6)).test(href); } catch { return false; }
  }
  return norm(href).startsWith(norm(pattern));
}
async function loadRules() {
  const st = await safeSyncGet(["autoLoginSites", "userId", "userPassword"]);
  return {
    rules: Array.isArray(st.autoLoginSites) ? st.autoLoginSites : [],
    creds: { userId: st.userId || "", userPassword: st.userPassword || "" }
  };
}
async function pickSiteRule() {
  const { rules } = await loadRules();
  const href = location.href;
  const rule = rules.find(r => urlStartsWith(href, r.pattern));
  LOG("pickSiteRule href=", href, "=>", rule ? rule.pattern : "no-match");
  return rule || null;
}

/* ---------- conditions ---------- */
function checkCondition(cond) {
  if (!cond) return true;
  if (cond.exists) return !!document.querySelector(cond.exists);
  if (cond.urlIncludes) return location.href.includes(cond.urlIncludes);
  if (cond.urlMatches) {
    try { return new RegExp(cond.urlMatches).test(location.href); } catch { return false; }
  }
  return true;
}

/* ---------- steps engine ---------- */
async function doStep(step, ctx) {
  const creds = ctx.creds;
  switch (step.act) {
    case "waitFor": {
      const el = step.visible
        ? await waitForVisible(step.selector, step.timeout ?? 15000)
        : await waitFor(step.selector, step.timeout ?? 15000);
      return el;
    }
    case "type": {
      const el = await waitFor(step.selector);
      const text = step.textFrom === "userId" ? creds.userId
        : step.textFrom === "userPassword" ? creds.userPassword
          : (step.text ?? "");
      setInputValue(el, text);
      return;
    }
    case "click": {
      if (step.visible) return safeClick(step.selector);
      const el = await waitFor(step.selector);
      el.click();
      return;
    }
    case "pressKey": {
      const target = step.selector ? await waitFor(step.selector) : document.activeElement;
      const key = step.key || "Enter";
      const ev = { key, bubbles: true };
      target.dispatchEvent(new KeyboardEvent("keydown", ev));
      target.dispatchEvent(new KeyboardEvent("keyup", ev));
      return;
    }
    case "delay": { await sleep(step.ms ?? 300); return; }
    case "submit": {
      if (step.selector) {
        const el = await waitFor(step.selector);
        if (el.tagName === "FORM") el.submit();
        else el.closest("form")?.submit();
      } else {
        document.activeElement?.closest("form")?.submit();
      }
      return;
    }
    case "setChecked": {
      const el = await waitFor(step.selector);
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.checked = !!step.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }
    case "select": {
      const el = await waitFor(step.selector);
      if (el instanceof HTMLSelectElement) {
        el.value = step.value ?? "";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }
    case "runIf": {
      const ok = checkCondition(step.condition || {});
      const branch = ok ? (step.then || []) : (step.else || []);
      for (const s of branch) await doStep(s, ctx);
      return;
    }
    case "navigate": { if (step.url) location.href = step.url; return; }
    case "log": { LOG(step.message ?? "(log)"); return; }
    default: WARN("Unknown act:", step.act);
  }
}

async function waitUntil(pred, timeout = 15000, interval = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (pred()) return true;
    await sleep(interval);
  }
  return false;
}

// รอให้ startWhen เป็นจริงแทนการเช็คครั้งเดียวแล้ว skip
async function waitStartWhen(cond, { timeout = 15000, visible = false } = {}) {
  if (!cond) return true;

  // 1) รอ selector (exists)
  if (cond.exists) {
    if (visible) {
      try { await waitForVisible(cond.exists, timeout); return true; }
      catch { return false; }
    } else {
      try { await waitFor(cond.exists, timeout); return true; }
      catch { return false; }
    }
  }

  // 2) รอ URL includes
  if (cond.urlIncludes) {
    return await waitUntil(() => location.href.includes(cond.urlIncludes), timeout);
  }

  // 3) รอ URL matches (RegExp)
  if (cond.urlMatches) {
    let re;
    try { re = new RegExp(cond.urlMatches); } catch { return false; }
    return await waitUntil(() => re.test(location.href), timeout);
  }

  // ไม่มีเงื่อนไขที่รู้จัก ถือว่า true
  return true;
}

/* ---------- run once per URL ---------- */
let running = false;
function hrefKey() { return "autologin:ranForHref:" + norm(location.href); }

async function runFlowOnceForThisURL() {
  const { creds } = await loadRules();
  const site = await pickSiteRule();
  if (!site) return false;

  if (site.autoRun === false) {
    LOG("matched but autoRun=false; skip");
    return false;
  }
  if (!creds.userId || !creds.userPassword) {
    WARN("Missing credentials.");
    return false;
  }

  LOG("run flow for", site.pattern);
  const ctx = { creds };
  for (const step of site.steps || []) {
    try { await doStep(step, ctx); }
    catch (e) {
      ERR("step error:", step, e);
      if (site.continueOnError) continue;
      else break;
    }
  }
  LOG("flow finished");
  return true;
}

function visitId() {
  // id ต่อการเข้าเพจครั้งนี้ (ต่อแท็บ/โหลดครั้ง)
  if (!sessionStorage.__autoLoginVisitId) {
    sessionStorage.__autoLoginVisitId = crypto.randomUUID();
  }
  return sessionStorage.__autoLoginVisitId;
}
function guardKeyForHref() {
  return "autologin:ran:" + norm(location.href) + "::" + visitId();
}
function hasRunForThisVisit() {
  return sessionStorage.getItem(guardKeyForHref()) === "1";
}
function markRanForThisVisit() {
  sessionStorage.setItem(guardKeyForHref(), "1");
}
function resetVisitGuardForCurrentHref() {
  // ล้างเฉพาะ key ของ href ปัจจุบันใน visit นี้
  sessionStorage.removeItem(guardKeyForHref());
}


/* ---------- orchestrator ---------- */
async function maybeAutoRunOnceForThisHref(src = "unknown") {
  // โหลดสดทุกครั้ง (เลิกพึ่ง cache อย่างเดียว)
  const on = await loadEnabled().catch(()=>__enabledCache);
  if (!on) { LOG("disabled by toggle; skip autorun. src=", src); return; }

  const site = await pickSiteRule();
  if (!site) return;
  if (site.autoRun === false) { LOG("matched but autoRun=false; src=", src); return; }

  // if (hasRunForThisVisit()) { LOG("already ran for this href (visit); src=", src); return; }
  if (running) { LOG("skip (running); src=", src); return; }

  const startWhenOk = await waitStartWhen(
    site.startWhen,
    { timeout: site.startWhenTimeout ?? 20000, visible: !!site.startWhenVisible }
  );
  if (!startWhenOk) { LOG("startWhen not satisfied after wait -> skip"); return; }

  running = true;
  LOG("autorun start, src=", src);
  try {
    const ok = await runFlowOnceForThisURL();
    if (ok) markRanForThisVisit();
  } finally {
    running = false;
  }
}

/* ---------- init & SPA hooks (1 ครั้งเมื่อ URL เปลี่ยนจริง) ---------- */
(async function init() {
  if (window.__autoLoginBooted) return;
  window.__autoLoginBooted = true;

  // โหลดสถานะ enabled เข้าคาッシュก่อนเสมอ
  await loadEnabled().catch(() => { });

  const kick = () => maybeAutoRunOnceForThisHref("dom-ready");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", kick, { once: true });
  } else {
    // รอ microtask นิดให้ storage listeners ตื่น
    setTimeout(() => maybeAutoRunOnceForThisHref("immediate"), 0);
  }

  // SPA: เมื่อ URL เปลี่ยนจริง ให้รีเซ็ต guard แล้วลอง autorun ใหม่
  const fire = () => {
    resetVisitGuardForCurrentHref();
    setTimeout(() => maybeAutoRunOnceForThisHref("url-change"), 200);
  };
  const _push = history.pushState;
  history.pushState = function (...a) { const r = _push.apply(this, a); fire(); return r; };
  const _replace = history.replaceState;
  history.replaceState = function (...a) { const r = _replace.apply(this, a); fire(); return r; };
  addEventListener("popstate", fire);
  addEventListener("hashchange", fire);

  // BFCache: กลับมาหน้าจากปุ่ม Back/Forward โดยไม่รีโหลดสคริปต์
  addEventListener("pageshow", (e) => {
    if (e.persisted) {
      // ถูกกู้คืนจาก BFCache -> อนุญาตให้รันใหม่ 1 ครั้งต่อ URL
      resetVisitGuardForCurrentHref();
      setTimeout(() => maybeAutoRunOnceForThisHref("pageshow-bfcache"), 0);
    }
  });

  // // เมื่อแท็บกลับมา active (บางเว็บ lazy mount DOM) -> ลองอีกครั้ง
  // document.addEventListener("visibilitychange", () => {
  //   if (document.visibilityState === "visible") {
  //     // ไม่บังคับรัน ถ้าเคยรัน visit นี้แล้ว guard ยังอยู่ก็จะไม่ยิงซ้ำ
  //     setTimeout(() => maybeAutoRunOnceForThisHref("visible"), 0);
  //   }
  // });
})();

/* ---------- manual from popup ---------- */
chrome.runtime.onMessage.addListener((msg,_s,send)=>{
  if (msg?.type === "RUN_FLOW_MANUAL") {
    // ถ้าอยากเคารพ toggle ให้เช็ค isEnabled(); ถ้าอยากให้ manual ลัด ก็รันตรง ๆ ได้
    runFlowOnceForThisURL().then(ok=>send({ok})).catch(_=>send({ok:false}));
    return true;
  }
});
