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