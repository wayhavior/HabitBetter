// firebase-messaging-sw.js
// ===== Firebase Service Worker =====

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyDneT0LeIJwZcKfjyAYEnkoQ5_D25LV43M",  // ← เปลี่ยน
    authDomain: "habit-better-df87d.firebaseapp.com",  // ← เปลี่ยน
    projectId: "habit-better-df87d",  // ← เปลี่ยน
    storageBucket: "habit-better-df87d.firebasestorage.app",  // ← เปลี่ยน
    messagingSenderId: "137647040602",  // ← เปลี่ยน
    appId: "1:137647040602:web:b56d8369acef44fc2f5063"  // ← เปลี่ยน
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('📬 Received background message:', payload);
    
    const notificationTitle = payload.notification?.title || 'การแจ้งเตือน';
    const notificationOptions = {
        body: payload.notification?.body || '',
        icon: './icon512_rounded.png',
        badge: './icon512_rounded.png',
        tag: 'notification',
        requireInteraction: false
    };
    
//    self.registration.showNotification(notificationTitle, notificationOptions);
});
