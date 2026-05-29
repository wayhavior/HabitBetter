// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "AIzaSyDneT0LeIJwZcKfjyAYEnkoQ5_D25LV43M",  // ← ใช้ค่าเดียวกับ script__3_.js
    authDomain: "habit-better-df87d.firebaseapp.com",
    projectId: "habit-better-df87d",
    storageBucket: "habit-better-df87d.firebasestorage.app",
    messagingSenderId: "137647040602",
    appId: "1:137647040602:web:b56d8369acef44fc2f5063"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('📬 Received background message: ', payload);
    
    const notificationTitle = payload.notification.title || 'การแจ้งเตือน';
    const notificationOptions = {
        body: payload.notification.body || '',
        icon: payload.notification.icon || '/logo.png',
        badge: '/badge-icon.png',
        tag: 'notification',
        requireInteraction: false
    };
    
    self.registration.showNotification(notificationTitle, notificationOptions);
});
