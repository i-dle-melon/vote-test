const PUSH_WORKER_URL = 'https://i-dle-vote-push.i-dle-melon.workers.dev';

function pushUrl(path) {
  return PUSH_WORKER_URL.replace(/\/$/, '') + path;
}

function pushBase64UrlToUint8Array(base64UrlData) {
  const padding = '='.repeat((4 - (base64UrlData.length % 4)) % 4);
  const base64 = (base64UrlData + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function pushDiag(message) {
  console.log('[i-dle-vote Push]', message);
}

async function getPushVapidPublicKey() {
  pushDiag('② 正在取得 VAPID Public Key…');
  const response = await fetch(pushUrl('/vapid-public-key'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`VAPID API HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok || !data.publicKey) throw new Error('VAPID Public Key 回應格式錯誤');
  pushDiag('② VAPID Public Key 取得成功');
  return data.publicKey;
}

async function getPushServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('此瀏覽器不支援 Service Worker');
  }

  pushDiag('① 等待 Service Worker ready…');

  const registration = await navigator.serviceWorker.ready;

  pushDiag('① Service Worker ready');
  return registration;
}

async function getCurrentPushSubscription() {
  const registration = await getPushServiceWorkerRegistration();
  if (!registration.pushManager) throw new Error('PushManager 不可用');
  const subscription = await registration.pushManager.getSubscription();
  pushDiag(subscription ? '③ 已存在 Push Subscription' : '③ 尚無 Push Subscription');
  return subscription;
}

async function enablePushNotifications() {
  try {
    pushDiag('開始啟用 Push');

    if (!('Notification' in window)) throw new Error('此瀏覽器不支援通知');
    if (!('PushManager' in window)) throw new Error('此瀏覽器不支援 Push API');
    if (!window.isSecureContext) throw new Error('網站不是 HTTPS 安全連線');

    if (Notification.permission === 'denied') {
      throw new Error('通知權限目前是拒絕，請到手機設定重新開啟');
    }

    if (Notification.permission !== 'granted') {
      pushDiag('正在請求通知權限…');
      const permission = await Notification.requestPermission();
      pushDiag(`通知權限結果：${permission}`);
      if (permission !== 'granted') throw new Error(`通知權限未開啟：${permission}`);
    } else {
      pushDiag('通知權限已經是 granted');
    }

    const registration = await getPushServiceWorkerRegistration();

    const vapidPublicKey = await getPushVapidPublicKey();

    pushDiag('③ 正在建立 Push Subscription…');
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: pushBase64UrlToUint8Array(vapidPublicKey)
      });
    }

    if (!subscription) throw new Error('Push Subscription 建立失敗');
    pushDiag('③ Push Subscription 建立成功');

    pushDiag('④ 正在註冊 Cloudflare Worker…');
    const response = await fetch(pushUrl('/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });

    if (!response.ok) throw new Error(`Cloudflare Worker HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Cloudflare Worker 註冊失敗');

    pushDiag('④ Cloudflare Worker 註冊成功');
    localStorage.setItem('idleVotePushEnabled', 'true');

    pushDiag('⑤ Push 開啟完成');
    alert('🔔 通知已開啟！');
    updatePushButtonState();

  } catch (error) {
    console.error('[i-dle-vote Push] ERROR', error);
    alert('通知開啟失敗：\n' + (error?.message || error));
  }
}

async function disablePushNotifications() {
  try {
    const subscription = await getCurrentPushSubscription();
    if (!subscription) {
      localStorage.removeItem('idleVotePushEnabled');
      updatePushButtonState();
      return;
    }

    const response = await fetch(pushUrl('/unsubscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });

    if (!response.ok) throw new Error(`Cloudflare Worker HTTP ${response.status}`);
    await subscription.unsubscribe();

    localStorage.removeItem('idleVotePushEnabled');
    alert('🔕 通知已關閉');
    updatePushButtonState();
  } catch (error) {
    console.error('[i-dle-vote Push] ERROR', error);
    alert('通知關閉失敗：\n' + (error?.message || error));
  }
}

async function togglePushNotifications() {
  try {
    const subscription = await getCurrentPushSubscription();
    if (subscription) await disablePushNotifications();
    else await enablePushNotifications();
  } catch (error) {
    console.error('[i-dle-vote Push] toggle ERROR', error);
    alert('Push 診斷失敗：\n' + (error?.message || error));
  }
}

async function updatePushButtonState() {
  try {
    const subscription = await getCurrentPushSubscription();
    const button = document.querySelector('.push-fab');
    if (!button) return;
    button.textContent = subscription ? '🔔' : '🔕';
    button.title = subscription ? '通知已開啟' : '開啟投票提醒';
    button.setAttribute('aria-label', button.title);
  } catch (error) {
    console.warn('[i-dle-vote Push] updatePushButtonState:', error);
  }
}

window.enablePushNotifications = enablePushNotifications;
window.disablePushNotifications = disablePushNotifications;
window.togglePushNotifications = togglePushNotifications;
window.updatePushButtonState = updatePushButtonState;

document.addEventListener('DOMContentLoaded', () => {
  updatePushButtonState();
});
