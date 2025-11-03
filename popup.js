async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const chk = document.getElementById("toggleExtension");

chrome.storage.sync.get(["enabled"], ({ enabled }) => {
    chk.checked = enabled ?? true; // default = enabled
});

chk.addEventListener("change", () => {
    chrome.storage.sync.set({ enabled: chk.checked });
});

async function openSettings() {
  await chrome.runtime.openOptionsPage();
}

async function runFlow() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'RUN_FLOW_MANUAL' });
    console.log('RUN_FLOW_MANUAL:', res);
  } catch (e) {
    // ถ้า content ยังไม่พร้อม ให้ลอง inject แล้วส่งใหม่
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    try {
      const res2 = await chrome.tabs.sendMessage(tab.id, { type: 'RUN_FLOW_MANUAL' });
      console.log('RUN_FLOW_MANUAL (after inject):', res2);
    } catch (err) {
      console.warn('Failed to run flow:', err);
    }
  }
}

async function detectMatch() {
  const st = await chrome.storage.sync.get(['autoLoginSites']);
  const rules = Array.isArray(st.autoLoginSites) ? st.autoLoginSites : [];
  const tab = await getActiveTab();
  const url = tab?.url || '';
  const site = rules.find(r => url && url.startsWith(r.pattern));

  const badge = document.getElementById('matchStatus');
  const siteName = document.getElementById('siteName');
  if (site) {
    badge.textContent = site.autoRun === false ? 'Matched (manual)' : 'Matched (auto)';
    siteName.textContent = new URL(site.pattern).hostname;
  } else {
    badge.textContent = 'No match';
    siteName.textContent = '';
  }
}

document.getElementById('openSettings').addEventListener('click', openSettings);
document.getElementById('runFlow').addEventListener('click', runFlow);

detectMatch();
