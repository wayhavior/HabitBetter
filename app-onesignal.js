// app-onesignal.js
// OneSignal Web Push Notification Setup

console.log("🚀 OneSignal Initializing...");

window.OneSignal = window.OneSignal || [];

OneSignal.push(function() {
    console.log("✅ OneSignal SDK Ready");
    
    // ✅ Init OneSignal 
    OneSignal.init({
        appId: "6d2966e8-0b04-4f19-9f6c-78d31ba9ad5d",
        // ไม่ต้องระบุ serviceWorkerPath
        allowLocalhostAsSecureOrigin: true,
        notifyButton: {
            enable: false
        }
    });

    // ✅ ป้องกัน OneSignal ค้นหา OneSignalSDKWorker.js
    // ด้วยการเซ็ต service worker path ให้เหมือน sw.js
    try {
        OneSignal.setServiceWorkerPath("/HabitBetter/sw.js");
    } catch(e) {
        console.log("Service worker already registered");
    }

    console.log("✅ OneSignal Initialized");
    
    // ฟังการเปลี่ยน subscription
    OneSignal.on("subscriptionChange", function(isSubscribed) {
        console.log("📢 Subscription changed:", isSubscribed);
        updatePushNotificationToggleUI(isSubscribed);
    });

    // ฟังการรับ notification
    OneSignal.on("notificationDisplay", function(event) {
        console.log("📬 Notification displayed:", event);
    });

    // ฟังการคลิก notification
    OneSignal.on("notificationClick", function(event) {
        console.log("👆 Notification clicked:", event);
    });
});

// ===== Push Notification Toggle Functions =====

function setupPushNotificationToggle() {
    console.log("🔔 [SETUP] Starting push notification toggle setup...");
    
    const toggleBtn = document.getElementById("push-notification-toggle");
    const toggleDot = document.getElementById("push-notification-toggle-dot");
    
    console.log("🔍 [SETUP] toggleBtn found:", !!toggleBtn);
    console.log("🔍 [SETUP] toggleDot found:", !!toggleDot);
    
    if (!toggleBtn) {
        console.warn("⚠️ [SETUP] Push notification toggle button not found - retrying in 500ms");
        setTimeout(setupPushNotificationToggle, 500);
        return;
    }
    
    console.log("✅ [SETUP] Found toggle button, setting up...");
    
    // ✅ Direct onclick handler
    toggleBtn.onclick = function() {
        console.log("👆 [CLICK] Toggle button clicked via onclick!");
        handlePushNotificationToggle();
    };
    
    // ✅ Also add addEventListener as backup
    toggleBtn.addEventListener("click", function() {
        console.log("👆 [CLICK] Toggle button clicked via addEventListener!");
        handlePushNotificationToggle();
    });
    
    // ✅ Check current status
    OneSignal.push(function() {
        console.log("✅ [SETUP] OneSignal ready, checking subscription status...");
        
        OneSignal.isPushNotificationsEnabled(function(isEnabled) {
            console.log("📢 [SETUP] Current push notification status:", isEnabled);
            updatePushNotificationToggleUI(isEnabled);
        });
        
        console.log("✅ [SETUP] Setup complete!");
    });
}

function updatePushNotificationToggleUI(isEnabled) {
    const toggleBtn = document.getElementById("push-notification-toggle");
    const toggleDot = document.getElementById("push-notification-toggle-dot");
    
    if (!toggleBtn || !toggleDot) {
        console.warn("⚠️ [UI UPDATE] Toggle elements not found");
        return;
    }
    
    console.log("🎨 [UI UPDATE] Updating UI - enabled:", isEnabled);
    
    if (isEnabled) {
        toggleBtn.style.background = "#4caf50";
        toggleDot.style.right = "2px";
        toggleDot.style.left = "auto";
        console.log("✅ [UI UPDATE] Toggle ON (green)");
    } else {
        toggleBtn.style.background = "#555";
        toggleDot.style.left = "2px";
        toggleDot.style.right = "auto";
        console.log("❌ [UI UPDATE] Toggle OFF (gray)");
    }
}

function handlePushNotificationToggle() {
    console.log("⚙️ [HANDLER] handlePushNotificationToggle called");
    
    OneSignal.push(function() {
        console.log("⚙️ [HANDLER] Inside OneSignal.push");
        
        OneSignal.isPushNotificationsEnabled(function(isEnabled) {
            console.log("⚙️ [HANDLER] isPushNotificationsEnabled result:", isEnabled);
            
            if (isEnabled) {
                // ถ้า enabled อยู่ ให้ unsubscribe
                console.log("🔕 [HANDLER] Unsubscribing from push notifications...");
                OneSignal.setSubscription(false);
                updatePushNotificationToggleUI(false);
                showNotification("✅ ปิด", "ปิดการแจ้งเตือนแล้ว", "success");
                console.log("✅ [HANDLER] Unsubscribed successfully");
                
            } else {
                // ถ้า disabled อยู่ ให้ subscribe
                console.log("🔔 [HANDLER] Showing push notification prompt...");
                OneSignal.showSlidedownPrompt();
                
                // อัปเดต UI หลังจากผู้ใช้กด
                setTimeout(() => {
                    console.log("⚙️ [HANDLER] Checking subscription status after prompt...");
                    OneSignal.isPushNotificationsEnabled(function(newStatus) {
                        console.log("⚙️ [HANDLER] New subscription status:", newStatus);
                        updatePushNotificationToggleUI(newStatus);
                        if (newStatus) {
                            showNotification("✅ สำเร็จ", "เปิดการแจ้งเตือนแล้ว", "success");
                            console.log("✅ [HANDLER] Subscribed successfully");
                        } else {
                            console.log("ℹ️ [HANDLER] User denied notification permission");
                        }
                    });
                }, 1000);
            }
        });
    });
}

console.log("✅ OneSignal Script Loaded");
