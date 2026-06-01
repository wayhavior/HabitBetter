// firebase-messaging-sw.js
// ===== Firebase Service Worker =====

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyDneT0LeIJwZcKfjyAYEnkoQ5_D25LV43M",
    authDomain: "habit-better-df87d.firebaseapp.com",
    projectId: "habit-better-df87d",
    storageBucket: "habit-better-df87d.firebasestorage.app",
    messagingSenderId: "137647040602",
    appId: "1:137647040602:web:b56d8369acef44fc2f5063"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ===== Background Messages =====
messaging.onBackgroundMessage((payload) => {
    console.log('📬 Received background message:', payload);
    
    const notificationTitle = payload.data?.title || payload.notification?.title || 'Habit Better';
    const notificationBody = payload.data?.body || payload.notification?.body || '';
    
    const notificationOptions = {
        body: notificationBody,
        icon: './icon512_rounded.png',
        badge: './icon512_rounded.png',
        tag: 'bg-notification-' + Date.now(), // ✅ Unique tag ทุกครั้ง
        requireInteraction: false,
        priority: 'high'
    };
    
    console.log('Background message received:', notificationTitle, notificationOptions);
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ===== Handle Messages from Main Script =====
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        console.log('📬 Message received from main script:', event.data);
        self.registration.showNotification(event.data.title, event.data.options);
    }
});

// ===== Notification Click =====
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked');
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // ถ้า Habit Better เปิดอยู่แล้ว ให้โฟกัสหน้าต่างเดิม
            for (const client of clientList) {
                if (client.url.includes('/HabitBetter/') && 'focus' in client) {
                    return client.focus();
                }
            }
            // ถ้ายังไม่เปิด ให้เปิด Habit Better
            if (clients.openWindow) {
                return clients.openWindow('/HabitBetter/');
            }
        })
    );
});

// ===== Keep Service Worker Alive =====
self.addEventListener('fetch', (event) => {
    // ✅ Simple fetch handler เพื่อให้ SW ไม่ timeout
    if (event.request.method === 'GET') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response('Offline');
            })
        );
    }
});

console.log('✅ Firebase Messaging Service Worker loaded');
