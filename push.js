/* i-dle-vote Web Push client
 * Stage 2: subscribe/unsubscribe and send subscription to Cloudflare Worker.
 *
 * IMPORTANT:
 * Set PUSH_WORKER_URL to your deployed push Worker URL.
 */
const PUSH_WORKER_URL = 'https://YOUR-PUSH-WORKER.workers.dev';

function pushUrl(path) {
    return PUSH_WORKER_URL.replace(/\/+$/, '') + path;
}

function pushBase64UrlToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function getPushVapidPublicKey() {
    const response = await fetch(pushUrl('/vapid-public-key'), {
        method: 'GET',
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error('無法取得 VAPID Public Key');
    }

    const data = await response.json();
    if (!data.publicKey) {
        throw new Error('Push Worker 沒有回傳 VAPID Public Key');
    }

    return data.publicKey;
}

async function getPushServiceWorkerRegistration() {
    if (!('serviceWorker' in navigator)) {
        throw new Error('此瀏覽器不支援 Service Worker');
    }

    return await navigator.serviceWorker.ready;
}

async function getCurrentPushSubscription() {
    const registration = await getPushServiceWorkerRegistration();
    return await registration.pushManager.getSubscription();
}

async function enablePushNotifications() {
    try {
        if (!('Notification' in window) || !('PushManager' in window)) {
            alert('這個瀏覽器目前不支援 Web Push 通知。');
            return;
        }

        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            alert('通知功能需要 HTTPS。GitHub Pages 正常支援 HTTPS。');
            return;
        }

        // iOS/iPadOS: Push API requires the web app to be installed to Home Screen.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS && !window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone) {
            alert('iPhone / iPad 請先把本網站「加入主畫面」，再從主畫面開啟後啟用通知。');
            return;
        }

        if (Notification.permission === 'denied') {
            alert('通知權限目前被瀏覽器拒絕。請到瀏覽器的網站通知設定重新允許。');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert('你沒有允許通知，因此無法啟用投票提醒。');
            return;
        }

        const registration = await getPushServiceWorkerRegistration();
        const publicKey = await getPushVapidPublicKey();

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: pushBase64UrlToUint8Array(publicKey)
            });
        }

        const subscriptionJson = subscription.toJSON();

        const response = await fetch(pushUrl('/subscribe'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscription: subscriptionJson,
                userAgent: navigator.userAgent
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || '無法儲存通知訂閱');
        }

        localStorage.setItem('idleVotePushEnabled', 'true');
        alert('🔔 投票提醒已開啟！之後即使關閉網頁，也可以收到開始／截止前通知。');

        if (typeof updatePushButtonState === 'function') {
            updatePushButtonState();
        }

    } catch (error) {
        console.error('[Push] enable failed:', error);
        alert('通知開啟失敗：' + (error.message || error));
    }
}

async function disablePushNotifications() {
    try {
        const subscription = await getCurrentPushSubscription();

        if (subscription) {
            const endpoint = subscription.endpoint;

            await subscription.unsubscribe();

            await fetch(pushUrl('/unsubscribe'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ endpoint })
            });
        }

        localStorage.removeItem('idleVotePushEnabled');

        alert('🔕 投票提醒已關閉。');

        if (typeof updatePushButtonState === 'function') {
            updatePushButtonState();
        }

    } catch (error) {
        console.error('[Push] disable failed:', error);
        alert('關閉通知時發生錯誤：' + (error.message || error));
    }
}

async function togglePushNotifications() {
    const enabled = localStorage.getItem('idleVotePushEnabled') === 'true';

    if (enabled) {
        await disablePushNotifications();
    } else {
        await enablePushNotifications();
    }
}

function updatePushButtonState() {
    const button = document.querySelector('.push-fab');
    if (!button) return;

    const enabled = localStorage.getItem('idleVotePushEnabled') === 'true';
    button.textContent = enabled ? '🔔' : '🔕';
    button.title = enabled ? '投票提醒已開啟，點擊關閉' : '開啟投票提醒通知';
    button.setAttribute('aria-label', button.title);
}

window.enablePushNotifications = enablePushNotifications;
window.disablePushNotifications = disablePushNotifications;
window.togglePushNotifications = togglePushNotifications;

document.addEventListener('DOMContentLoaded', updatePushButtonState);
