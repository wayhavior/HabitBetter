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

    // เปลี่ยนจาก payload.notification มาดึงจาก payload.data แทน
    // เพื่อบังคับให้สิทธิ์ขาดการวาดเป็นของ PWA เท่านั้น
    const notificationTitle = payload.data?.title || 'การแจ้งเตือนจาก Habit Better';

    const notificationOptions = {
        body: payload.data?.body || '',
        icon: './icon512_rounded.png',
        badge: './icon512_rounded.png',
        tag: 'notification',
        requireInteraction: false
    };

    console.log('Background message received:', notificationTitle, notificationOptions);

    // เปิดใช้งานบรรทัดนี้ เพื่อให้ PWA เป็นคนสร้าง Notification อันเดียวโดดๆ
    self.registration.showNotification(notificationTitle, notificationOptions);
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
