const CACHE_NAME = "i-dle-vote-pwa-v2";

self.addEventListener("install", (event) => {
  console.log("[PWA] Service Worker installing");

  event.waitUntil(
    self.skipWaiting()
  );
});

self.addEventListener("activate", (event) => {
  console.log("[PWA] Service Worker activating");

  event.waitUntil(
    self.clients.claim()
  );
});

self.addEventListener("fetch", (event) => {
  // 先不攔截網路請求。
  // 等 Push 功能確認正常後，再恢復 PWA 快取。
  return;
});

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {
      body: event.data ? event.data.text() : ""
    };
  }

  const title = data.title || "i-dle* 投票提醒";

  const options = {
    body: data.body || "有新的投票提醒。",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: data.tag || "i-dle-vote-notification",
    renotify: Boolean(data.renotify),
    data: {
      url: data.url || "./VoteTest.html"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./VoteTest.html",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((clientList) => {

      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
