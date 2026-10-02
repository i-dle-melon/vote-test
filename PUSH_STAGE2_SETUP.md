# i-dle-vote Web Push 第二階段部署

## 你已經完成

Google Sheet 的 `提醒通知`：

| enabled | vote_id | title | start_at | end_at | remind_before_min |
|---|---|---|---|---|---|
| TRUE | mubank-001 | Music Bank 投票 | 2026/10/01 11:00 | 2026/10/03 22:59 | 60 |
| TRUE | inkigayo-001 | 人氣歌謠投票 | 2026/10/04 14:35 | 2026/10/04 15:25 | 30 |

這個欄位設計直接沿用。

---

# A. Google Apps Script

在你的 Google Sheet：

「擴充功能」→「Apps Script」

把 `Code.gs` 全部貼上。

## Script Properties

Apps Script → 專案設定 → Script Properties

建立：

```text
PUSH_WORKER_URL = https://YOUR-PUSH-WORKER.workers.dev
PUSH_API_SECRET = 你自己產生的一串長隨機字串
SITE_URL = https://YOUR-USERNAME.github.io/YOUR-REPO/VoteTest.html
```

`PUSH_API_SECRET` 必須與 Cloudflare Worker 相同。

## 時區

Apps Script 專案時區請設定：

```text
Asia/Taipei
```

## 初始化

執行：

```text
setupPushSystem
```

它會自動建立：

```text
PushSubscriptions
NotificationLog
```

以及每 5 分鐘執行一次的排程。

---

# B. 部署 Apps Script Web App

Apps Script：

「部署」→「新增部署」

類型：

```text
網頁應用程式
```

設定：

```text
執行身分：我
誰可以存取：所有人
```

部署後取得：

```text
https://script.google.com/macros/s/XXXXXXXX/exec
```

把這個 URL 填到 Cloudflare Worker：

```text
APPS_SCRIPT_URL
```

---

# C. Cloudflare Worker

進入：

```text
cloudflare-push-worker
```

安裝：

```bash
npm install
```

產生 VAPID：

```bash
node generate-vapid.mjs
```

會得到：

```json
{
  "publicKey": "...",
  "privateKey": "..."
}
```

這組 key 要長期保存。

## Worker secrets

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npx wrangler secret put PUSH_API_SECRET
npx wrangler secret put APPS_SCRIPT_URL
```

例如：

```text
VAPID_SUBJECT
mailto:你的email@example.com
```

## 部署

```bash
npm run deploy
```

取得：

```text
https://i-dle-vote-push.xxxxx.workers.dev
```

---

# D. 修改 push.js

把：

```js
const PUSH_WORKER_URL = 'https://YOUR-PUSH-WORKER.workers.dev';
```

換成實際 Worker URL。

例如：

```js
const PUSH_WORKER_URL = 'https://i-dle-vote-push.xxxxx.workers.dev';
```

---

# E. GitHub Pages

把這些檔案放到與 VoteTest.html 相同的 GitHub Pages 目錄：

```text
VoteTest.html
manifest.json
sw.js
push.js
icons/
  icon-192.png
  icon-512.png
```

---

# F. 測試順序

不要一開始就等到真正的投票時間。

先：

1. 開啟 GitHub Pages
2. 進入非首頁頁面
3. 點右側 `🔕`
4. 允許通知
5. 確認 Google Sheet 出現 `PushSubscriptions` 資料
6. 關閉網頁
7. 用 Apps Script 的測試函式／Worker 測試

確認成功後，再測：

```text
提醒通知
   ↓
開始時間
   ↓
🔔 投票開始
```

以及：

```text
提醒通知
   ↓
end_at - remind_before_min
   ↓
⏰ 即將截止
```

---

# 重要

不要把：

```text
VAPID_PRIVATE_KEY
PUSH_API_SECRET
```

放進：

```text
VoteTest.html
push.js
GitHub Pages
```

這兩個只放在伺服器端。

VAPID public key 可以公開給瀏覽器；private key 必須留在 Worker。Web Push 本身就是透過 VAPID public/private key 配對來完成應用伺服器認證。Cloudflare Workers 目前可直接使用 Web Crypto，這也是這版 Worker 採用 edge-native Web Push 實作的原因。
