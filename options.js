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


// ===== storage =====
const store = {
    async get() {
        const st = await safeSyncGet(["enabled", "userId", "userPassword", "autoLoginSites"]);
        return {
            enabled: st.enabled ?? true, // default = enabled
            userId: st.userId || "",
            userPassword: st.userPassword || "",
            autoLoginSites: Array.isArray(st.autoLoginSites) ? st.autoLoginSites : []
        };

    },
    async setCred(userId, userPassword) { await safeSyncSet({ userId, userPassword }); },
    async setRules(rules) { await safeSyncSet({ autoLoginSites: rules }); }
};

// ===== defaults =====
const defaultRules = [
    {
        pattern: "https://student.mytcas.com",
        autoRun: true,
        continueOnError: false,
        startWhen: { exists: "input[type='text'][required]" },
        startWhenVisible: true,
        startWhenTimeout: 20000,
        steps: [
            { act: "waitFor", selector: "input[type='text'][required]", timeout: 20000, visible: true },
            { act: "type", selector: "input[type='text'][required]", textFrom: "userId" },
            { act: "click", selector: "a.btn-main, button.btn-main, [class*='btn-main']" },
            { act: "waitFor", selector: "input[type='password']", visible: true },
            { act: "type", selector: "input[type='password']", textFrom: "userPassword" },
            { act: "click", selector: "a.btn-main, button.btn-main, [class*='btn-main']" }
        ]
    }
];

// ===== elements =====
const els = {
    // tabs
    tabs: Array.from(document.querySelectorAll(".tab")),
    panels: {
        cred: document.getElementById("tab-cred"),
        sites: document.getElementById("tab-sites"),
        tools: document.getElementById("tab-tools"),
    },
    // cred
    userId: document.getElementById("userId"),
    userPassword: document.getElementById("userPassword"),
    toggleCre: document.getElementById("toggleCre"),
    copyPw: document.getElementById("copyPw"),
    saveCred: document.getElementById("saveCred"),
    // sites list
    ruleList: document.getElementById("ruleList"),
    addRule: document.getElementById("addRule"),
    dupRule: document.getElementById("dupRule"),
    delRule: document.getElementById("delRule"),
    moveUp: document.getElementById("moveUp"),
    moveDown: document.getElementById("moveDown"),
    importRules: document.getElementById("importRules"),
    exportRules: document.getElementById("exportRules"),
    fileImport: document.getElementById("fileImport"),
    // editor
    edPattern: document.getElementById("edPattern"),
    edAutoRun: document.getElementById("edAutoRun"),
    edCOE: document.getElementById("edCOE"),
    edSWType: document.getElementById("edSWType"),
    edSWValue: document.getElementById("edSWValue"),
    edSWVisible: document.getElementById("edSWVisible"),
    edSWTimeout: document.getElementById("edSWTimeout"),
    edSteps: document.getElementById("edSteps"),
    fmtSteps: document.getElementById("fmtSteps"),
    validateSteps: document.getElementById("validateSteps"),
    saveRule: document.getElementById("saveRule"),
    edMsg: document.getElementById("edMsg"),
    // advanced raw
    rulesRaw: document.getElementById("rulesRaw"),
    formatRaw: document.getElementById("formatRaw"),
    saveRaw: document.getElementById("saveRaw"),
    // header status
    rulesCount: document.getElementById("rulesCount"),
    jsonState: document.getElementById("jsonState"),
    // docs
    showDocs: document.getElementById("showDocs"),
    closeDocs: document.getElementById("closeDocs"),
    docsDialog: document.getElementById("docsDialog"),
};

let state = {
    rules: [],
    selected: 0
};

// ===== tabs =====
els.tabs.forEach(btn => {
    btn.addEventListener("click", () => {
        els.tabs.forEach(b => b.classList.toggle("active", b === btn));
        Object.values(els.panels).forEach(p => p.classList.remove("active"));
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
});

// ===== init =====
(async function init() {
    const st = await store.get();
    els.userId.value = st.userId;
    els.userPassword.value = st.userPassword;
    state.rules = st.autoLoginSites.length ? st.autoLoginSites : defaultRules.slice();
    state.selected = Math.min(state.selected, state.rules.length - 1);
    renderRuleList();
    loadEditorFromRule();
    renderRaw();
    updateCounters();
    els.userId.focus();
})();

// ===== helpers =====
function updateCounters() {
    els.rulesCount.textContent = `Rules: ${state.rules.length}`;
    try { JSON.stringify(state.rules); els.jsonState.textContent = "JSON OK"; els.jsonState.className = "chip chip--ok"; }
    catch (e) { els.jsonState.textContent = "Invalid JSON"; els.jsonState.className = "chip"; }
}
function renderRuleList() {
    els.ruleList.innerHTML = "";
    state.rules.forEach((r, i) => {
        const li = document.createElement("li");
        li.className = "rule-item" + (i === state.selected ? " active" : "");
        const left = document.createElement("div");
        left.className = "pattern";
        left.textContent = r.pattern || "(no pattern)";
        const right = document.createElement("div");
        right.className = "badges";
        const b1 = document.createElement("span");
        b1.className = "badge" + (r.autoRun ? "" : " badge--off");
        b1.textContent = "autoRun";
        const b2 = document.createElement("span");
        b2.className = "badge" + (r.continueOnError ? "" : " badge--off");
        b2.textContent = "COE";
        right.append(b1, b2);
        li.append(left, right);
        li.addEventListener("click", () => {
            state.selected = i;
            renderRuleList();
            loadEditorFromRule();
        });
        els.ruleList.appendChild(li);
    });
}
function loadEditorFromRule() {
    const r = state.rules[state.selected];
    if (!r) { clearEditor(); return; }
    els.edPattern.value = r.pattern || "";
    els.edAutoRun.checked = !!r.autoRun;
    els.edCOE.checked = !!r.continueOnError;

    // startWhen
    let swType = "", swVal = "", swVisible = false, swTimeout = "";
    if (r.startWhen) {
        if (r.startWhen.exists) { swType = "exists"; swVal = r.startWhen.exists; }
        else if (r.startWhen.urlIncludes) { swType = "urlIncludes"; swVal = r.startWhen.urlIncludes; }
        else if (r.startWhen.urlMatches) { swType = "urlMatches"; swVal = r.startWhen.urlMatches; }
    }
    swVisible = !!r.startWhenVisible;
    swTimeout = r.startWhenTimeout ?? "";

    els.edSWType.value = swType;
    els.edSWValue.value = swVal;
    els.edSWVisible.checked = swVisible;
    els.edSWTimeout.value = swTimeout;

    els.edSteps.value = JSON.stringify(r.steps || [], null, 2);
    els.edMsg.textContent = "";
}
function clearEditor() {
    els.edPattern.value = "";
    els.edAutoRun.checked = true;
    els.edCOE.checked = false;
    els.edSWType.value = "";
    els.edSWValue.value = "";
    els.edSWVisible.checked = false;
    els.edSWTimeout.value = "";
    els.edSteps.value = "[]";
    els.edMsg.textContent = "";
}
function readEditorToRule() {
    const r = state.rules[state.selected] || {};
    r.pattern = els.edPattern.value.trim();
    r.autoRun = !!els.edAutoRun.checked;
    r.continueOnError = !!els.edCOE.checked;

    // startWhen builder
    const type = els.edSWType.value;
    const val = els.edSWValue.value.trim();
    r.startWhen = undefined;
    if (type && val) {
        r.startWhen = {};
        if (type === "exists") r.startWhen.exists = val;
        if (type === "urlIncludes") r.startWhen.urlIncludes = val;
        if (type === "urlMatches") r.startWhen.urlMatches = val;
    }
    const vis = !!els.edSWVisible.checked;
    const to = els.edSWTimeout.value.trim();
    r.startWhenVisible = vis || undefined;
    r.startWhenTimeout = to ? Number(to) : undefined;

    // steps
    try {
        const arr = JSON.parse(els.edSteps.value);
        if (!Array.isArray(arr)) throw new Error("Steps must be an array");
        r.steps = arr;
        els.edMsg.textContent = "";
    } catch (e) {
        els.edMsg.textContent = "Invalid steps JSON: " + e.message;
        throw e;
    }

    state.rules[state.selected] = r;
}
function renderRaw() {
    els.rulesRaw.value = JSON.stringify(state.rules, null, 2);
}

// ===== creds =====
// Toggle both ID + Password together
document.getElementById("toggleCre").addEventListener("click", () => {
    const userId = document.getElementById("userId");
    const userPw = document.getElementById("userPassword");

    // toggle ทั้งคู่ตาม type ของช่อง ID
    const newType = userId.type === "password" ? "text" : "password";
    userId.type = newType;
    userPw.type = newType;
});
els.copyPw.addEventListener("click", async () => { try { await navigator.clipboard.writeText(els.userPassword.value); } catch { } });
els.saveCred.addEventListener("click", async () => {
    await store.setCred(els.userId.value.trim(), els.userPassword.value);
    try {
        readEditorToRule();
        await store.setRules(state.rules);
        renderRuleList(); renderRaw(); updateCounters();
        toast("Saved rule.");
    } catch (_) { }
    toast("Saved credentials.");
});

// ===== list controls =====
els.addRule.addEventListener("click", () => {
    state.rules.push({
        pattern: "https://example.com",
        autoRun: true,
        continueOnError: false,
        steps: []
    });
    state.selected = state.rules.length - 1;
    renderRuleList(); loadEditorFromRule(); renderRaw(); updateCounters();
});
els.dupRule.addEventListener("click", () => {
    const r = state.rules[state.selected];
    if (!r) return;
    const clone = JSON.parse(JSON.stringify(r));
    state.rules.splice(state.selected + 1, 0, clone);
    state.selected++;
    renderRuleList(); loadEditorFromRule(); renderRaw(); updateCounters();
});
els.delRule.addEventListener("click", () => {
    if (state.rules.length === 0) return;
    state.rules.splice(state.selected, 1);
    state.selected = Math.max(0, state.selected - 1);
    renderRuleList(); loadEditorFromRule(); renderRaw(); updateCounters();
});
els.moveUp.addEventListener("click", () => {
    const i = state.selected; if (i <= 0) return;
    [state.rules[i - 1], state.rules[i]] = [state.rules[i], state.rules[i - 1]];
    state.selected = i - 1;
    renderRuleList(); renderRaw(); updateCounters();
});
els.moveDown.addEventListener("click", () => {
    const i = state.selected; if (i >= state.rules.length - 1) return;
    [state.rules[i + 1], state.rules[i]] = [state.rules[i], state.rules[i + 1]];
    state.selected = i + 1;
    renderRuleList(); renderRaw(); updateCounters();
});

// ===== editor controls =====
els.fmtSteps.addEventListener("click", () => {
    try { els.edSteps.value = JSON.stringify(JSON.parse(els.edSteps.value), null, 2); els.edMsg.textContent = ""; }
    catch (e) { els.edMsg.textContent = "Invalid steps JSON: " + e.message; }
});
els.validateSteps.addEventListener("click", () => {
    els.edMsg.classList.remove("ok", "err"); // reset state
    try {
        const arr = JSON.parse(els.edSteps.value);
        if (!Array.isArray(arr)) throw new Error("Steps must be an array");
        let okActs = new Set(["waitFor", "type", "click", "pressKey", "delay", "submit", "setChecked", "select", "runIf", "navigate", "log"]);
        const bad = arr.find(s => !s || typeof s !== "object" || !okActs.has(s.act));
        if (bad) throw new Error("Unknown or missing act in steps.");
        els.edMsg.textContent = "✅ Steps OK";
        els.edMsg.classList.add("ok");
    } catch (e) {
        els.edMsg.textContent = "❌ Invalid steps: " + e.message;
        els.edMsg.classList.add("err");
    }
});
els.saveRule.addEventListener("click", async () => {
    try {
        readEditorToRule();
        await store.setRules(state.rules);
        renderRuleList(); renderRaw(); updateCounters();
        toast("Saved rule.");
    } catch (_) { }
});

// ===== import/export & raw =====
els.importRules.addEventListener("click", () => els.fileImport.click());
els.fileImport.addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
        const txt = await f.text();
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr)) throw new Error("Rules must be an array");
        state.rules = arr; state.selected = 0;
        await store.setRules(state.rules);
        renderRuleList(); loadEditorFromRule(); renderRaw(); updateCounters();
        toast("Imported rules.");
    } catch (err) {
        toast("Invalid JSON file: " + err.message, true);
    } finally { e.target.value = ""; }
});
els.exportRules.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.rules, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "autoLoginRules.json";
    a.click();
    URL.revokeObjectURL(a.href);
});
els.formatRaw.addEventListener("click", () => {
    try { els.rulesRaw.value = JSON.stringify(JSON.parse(els.rulesRaw.value), null, 2); }
    catch { }
});
els.saveRaw.addEventListener("click", async () => {
    try {
        const arr = JSON.parse(els.rulesRaw.value);
        if (!Array.isArray(arr)) throw new Error("Rules must be an array");
        state.rules = arr; state.selected = Math.min(state.selected, state.rules.length - 1);
        await store.setRules(state.rules);
        renderRuleList(); loadEditorFromRule(); updateCounters();
        toast("Saved all rules.");
    } catch (err) {
        toast("Invalid JSON: " + err.message, true);
    }
});

// ===== docs dialog =====
els.showDocs.addEventListener("click", () => els.docsDialog.showModal());
els.closeDocs?.addEventListener("click", () => els.docsDialog.close());

// ===== utilities =====
function toast(msg, isErr = false) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = `
    position:fixed; bottom:18px; left:50%; transform:translateX(-50%);
    background:${isErr ? "rgba(255,110,110,.95)" : "rgba(110,168,255,.95)"};
    color:${isErr ? "#380a0a" : "#0b1020"};
    padding:8px 12px; border-radius:10px; z-index:9999; font-weight:700;
    box-shadow:0 10px 30px rgba(0,0,0,.35)
  `;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .25s"; }, 1400);
    setTimeout(() => el.remove(), 1800);
}
