// app-onesignal.js
// ตั้งค่า OneSignal Push Notification

console.log("🚀 OneSignal App Initializing...");

// ตั้งค่า OneSignal
window.OneSignal = window.OneSignal || [];

OneSignal.push(function() {
    console.log("✅ OneSignal Ready");
    
    // ตั้งค่า OneSignal
    OneSignal.init({
        appId: "6d2966e8-0b04-4f19-9f6c-78d31ba9ad5d",
        serviceWorkerPath: "OneSignalSDKWorker.js",
        allowLocalhostAsSecureOrigin: true,
    });

    // ตั้งค่า Service Worker
    OneSignal.setServiceWorkerPath("OneSignalSDKWorker.js");

    // ฟังการเปลี่ยนแปลง Subscription
    OneSignal.on("subscriptionChange", function(isSubscribed) {
        console.log("📢 Subscription changed:", isSubscribed);
        updateStatus(isSubscribed);
    });

    // ฟังการแสดง Notification
    OneSignal.on("notificationDisplay", function(event) {
        console.log("📬 Notification displayed:", event);
    });

    // ฟังการคลิก Notification
    OneSignal.on("notificationClick", function(event) {
        console.log("👆 Notification clicked:", event);
    });

    // ตรวจสอบสถานะ Subscription ปัจจุบัน
    checkSubscriptionStatus();
});

// ฟังก์ชัน: ตรวจสอบสถานะ Subscription
function checkSubscriptionStatus() {
    OneSignal.push(function() {
        OneSignal.isPushNotificationsEnabled(function(isEnabled) {
            console.log("📊 Current subscription status:", isEnabled);
            updateStatus(isEnabled);
        });
    });
}

// ฟังก์ชัน: อัปเดตสถานะ UI
function updateStatus(isSubscribed) {
    const statusEl = document.getElementById("notification-status");
    const btnEl = document.getElementById("subscribe-btn");
    
    if (statusEl) {
        if (isSubscribed) {
            statusEl.textContent = "✅ Subscribe แล้ว! คุณจะได้รับ Push Notification";
            statusEl.className = "status-success";
            if (btnEl) btnEl.textContent = "Unsubscribe";
        } else {
            statusEl.textContent = "❌ ยังไม่ Subscribe - กดปุ่มด้านล่างเพื่อรับ Notification";
            statusEl.className = "status-warning";
            if (btnEl) btnEl.textContent = "Subscribe to Notifications";
        }
    }
}

// ฟังก์ชัน: จัดการปุ่ม Subscribe
function handleSubscribeClick() {
    OneSignal.push(function() {
        OneSignal.isPushNotificationsEnabled(function(isEnabled) {
            if (isEnabled) {
                // ถ้า Subscribe แล้ว ให้ Unsubscribe
                console.log("🔕 Unsubscribing...");
                OneSignal.setSubscription(false);
            } else {
                // ถ้ายังไม่ Subscribe ให้แสดง Prompt
                console.log("🔔 Showing subscription prompt...");
                OneSignal.showSlidedownPrompt();
            }
        });
    });
}

// สร้าง UI ปุ่ม Subscribe (ถ้ายังไม่มี)
document.addEventListener("DOMContentLoaded", function() {
    // ตรวจสอบว่ามี element ไหม
    const statusEl = document.getElementById("notification-status");
    const btnEl = document.getElementById("subscribe-btn");
    
    if (!statusEl || !btnEl) {
        console.warn("⚠️ notification-status or subscribe-btn element not found");
    }
    
    // ให้ปุ่ม Subscribe ใช้งานได้
    if (btnEl) {
        btnEl.addEventListener("click", handleSubscribeClick);
    }
});

console.log("✅ OneSignal Script Loaded");
