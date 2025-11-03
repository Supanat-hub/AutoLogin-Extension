# 🔐 Auto Login — Chrome Extension

Auto Login is a lightweight Chrome extension that automatically fills login forms based on rules you configure.

- ✅ No data collection
- ✅ Credentials stored only in your browser (never uploaded)
- ✅ Easy rule builder (no coding needed)
- ✅ Open-source project

> Focus: Speed, privacy, and full user control.

---

## 🚀 Features

| Feature | Description |
|---------|-------------|
| 🔒 Auto Login | Automatically enters ID & Password for selected URLs |
| ⚡ Fast Automation | Does not inject heavy libraries like Selenium |
| 🧠 Smart rules | Supports `waitFor`, `type`, `click`, `runIf`, `navigate` |
| 🎯 Control | Auto-run toggle via popup |
| 🤫 Privacy First | No tracking, no analytics, no backend server |

---

## 🛠 Supported Actions (Cheatsheet)

| Action | Meaning |
|--------|---------|
| `waitFor` | Wait for selector before running |
| `type` | Fill input |
| `click` | Click element |
| `pressKey` | Simulate keystroke |
| `delay` | Delay execution |
| `runIf` | Conditional steps |

Example rule:
```
{
  "pattern": "https://student.mytcas.com",
  "autoRun": true,
  "continueOnError": false,
  "steps": [
    { "act": "waitFor", "selector": "input[type='text'][required]" },
    { "act": "type", "selector": "input[type='text'][required]", "textFrom": "userId" },
    { "act": "click", "selector": "a[class='btn-main cursor-pointer']" },
    { "act": "waitFor", "selector": "input[type='password']" },
    { "act": "type", "selector": "input[type='password']", "textFrom": "userPassword" },
    { "act": "click", "selector": "a[class='btn-main cursor-pointer']" }
  ]
}
```
---

## 📦 Installation (Development Mode)

1. Clone or download project
2. Go to `chrome://extensions`
3. Enable Developer mode
4. Load unpacked extension
5. Select this folder

---

## 🔐 Privacy Policy
We do NOT collect any user data. All credentials remain local.

Privacy Policy:
https://github.com/Supanat-hub/AutoLogin-Extension/blob/main/PRIVACY_POLICY.md

---

## 🧑‍💻 Developer
GitHub: https://github.com/Supanat-hub
Instagram: https://www.instagram.com/p.spn_

Made with ❤️ for productivity.