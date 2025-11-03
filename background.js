async function triggerRun(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'RUN_FLOW_MANUAL' });
  } catch {
    // ถ้า content ยังไม่พร้อม ให้ inject ใหม่
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tabId, { type: 'RUN_FLOW_MANUAL' });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  triggerRun(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'run-auto-login') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) triggerRun(tab.id);
});
