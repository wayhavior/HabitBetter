async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
const app = document.getElementById("app");

/* ===== CONFIGURATION ===== */
// ✅ ลบ CLOUD_API_URL - ไม่ส่งข้อมูลขึ้น Google Sheets อีกต่อไป
// 🗑️ ลบ EXP_PER_LEVEL - ระบบ EXP ถูกลบแล้ว
// Google OAuth Configuration
const GOOGLE_CLIENT_ID = "192099173031-arqdd6koquej0is89egvmna3bg7j552m.apps.googleusercontent.com"; // ✏️ เปลี่ยนเป็น Client ID ของคุณ
const GOOGLE_API_KEY = "AIzaSyATr3RANcNwBMal7MSrtkwG4p4A7vCwq5E";
let accessToken = null;

// 🌟 เพิ่มบล็อกโค้ดนี้เข้าไปด้านล่าง let accessToken = null; ครับ 🌟
if (localStorage.getItem("googleDriveToken")) {
    accessToken = localStorage.getItem("googleDriveToken");
}

// ===== FIREBASE CONFIGURATION & INITIALIZATION =====

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDneT0LeIJwZcKfjyAYEnkoQ5_D25LV43M",
    authDomain: "habit-better-df87d.firebaseapp.com",
    projectId: "habit-better-df87d",
    storageBucket: "habit-better-df87d.firebasestorage.app",
    messagingSenderId: "137647040602",
    appId: "1:137647040602:web:b56d8369acef44fc2f5063"
};

const FIREBASE_VAPID_KEY = "BNpaWO00mhBS7FrXIKHxcyXpBNDA8BdVi9ltM8Vosg5jGYq2wvYpU0g2BgdfTY0lNUPYU69zEzzaWVv7_M0qm0o";

let firebaseMessaging = null;

try {
    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase initialized');
    }
    
    // Get Messaging instance
    firebaseMessaging = firebase.messaging();
    console.log('✅ Firebase Messaging ready');
} catch (error) {
    console.warn('⚠️ Firebase initialization warning:', error.message);
}

// ===== HANDLE FOREGROUND MESSAGES =====

if (firebaseMessaging) {
    firebaseMessaging.onMessage((payload) => {
        console.log('📬 Received foreground message:', payload);
        
        const notificationTitle = payload.data?.title || payload.notification?.title || 'Habit Better';
        const notificationBody = payload.data?.body || payload.notification?.body || '';
        
        // ✅ สร้าง notification ให้เห็นตอนแอพเปิดอยู่
        const options = {
            body: notificationBody,
            icon: './icon512_rounded.png',
            badge: './icon512_rounded.png',
            tag: 'foreground-notification-' + Date.now(), // ✅ ให้แต่ละ notification มี unique tag
            requireInteraction: false,
            priority: 'high'
        };
        
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: notificationTitle,
                options: options
            });
        } else {
            // Fallback: สร้าง notification โดยตรง
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(notificationTitle, options);
            }
        }
    });
}

// ===== REQUEST NOTIFICATION PERMISSION =====

async function requestNotificationPermission() {
    try {
        // Check if browser supports notifications
        if (!('Notification' in window)) {
            console.warn('⚠️ This browser does not support notifications');
            return null;
        }

        // Request permission
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            console.log('✅ Notification permission granted');
            
            if (firebaseMessaging) {
                try {
                    const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');

                    const token = await firebaseMessaging.getToken({
                        vapidKey: FIREBASE_VAPID_KEY,
                        serviceWorkerRegistration: registration
                    });
                    
                    if (token) {
                        console.log('✅ FCM Token received:', token);
                        
                        // Save token
                        localStorage.setItem('fcmToken', token);
                        localStorage.setItem('notificationsEnabled', 'true');
                        
                        // 🟢 ส่ง Token นี้ไปลงทะเบียนกลุ่มที่หลังบ้าน (Server) ของเรา
                        sendTokenToBackendServer(token, 'all_users');
                        
                        // Show success message
                        showNotification(
                            "✅ Push Notification เปิดแล้ว",
                            "คุณจะได้รับการแจ้งเตือนแบบ Push",
                            "success"
                        );
                        
                        // Update button
                        updateNotificationButtonUI();
                        
                        
                        
                        return token;
                    }
                } catch (error) {
                    console.error('❌ Error getting FCM token:', error);
                    showNotification(
                        "⚠️ เกิดข้อผิดพลาด",
                        "ไม่สามารถเปิด Push Notification ได้",
                        "error"
                    );
                }
            } else {
                console.warn('⚠️ Firebase Messaging not available');
            }
        } else if (permission === 'denied') {
            console.log('❌ Notification permission denied');
            showNotification(
                "❌ ไม่ได้รับอนุญาต",
                "กรุณาอนุญาตให้เปิด Push Notification ในการตั้งค่า",
                "error"
            );
        }
    } catch (error) {
        console.error('❌ Error requesting notification permission:', error);
    }
}

// 🟢 ฟังก์ชันส่ง Token ไปหา Server หลังบ้านของเราเพื่อเข้ากลุ่ม (Topic)
function sendTokenToBackendServer(token, topicName) {
    const backendUrl = "https://subscribetotopic-krcnhvb7hq-uc.a.run.app";

    console.log('⏳ กำลังส่ง Token ไปลงทะเบียนที่หลังบ้าน...');

    fetch(backendUrl, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
            token: token, 
            topic: topicName 
        })
    })
    .then(response => {
        if (response.ok) {
            console.log(`✅ เซิร์ฟเวอร์หลังบ้านจัดการนำเครื่องนี้เข้ากลุ่ม [${topicName}] เรียบร้อย!`);
        } else {
            console.warn('❌ เซิร์ฟเวอร์หลังบ้านตอบกลับมาว่าเกิดข้อผิดพลาด');
        }
    })
    .catch(error => {
        console.error('❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์หลังบ้านได้:', error);
    });
}

// ===== UPDATE NOTIFICATION BUTTON UI =====

function updateNotificationButtonUI() {
    const notificationBtn = document.getElementById('enable-notification-btn');
    if (notificationBtn) {
        const fcmToken = localStorage.getItem('fcmToken');
        if (fcmToken) {
            notificationBtn.textContent = '✅ เปิดแล้ว';
            notificationBtn.disabled = true;
            notificationBtn.style.opacity = '0.6';
            notificationBtn.style.cursor = 'not-allowed';
        } else {
            notificationBtn.textContent = 'เปิด';
            notificationBtn.disabled = false;
            notificationBtn.style.opacity = '1';
            notificationBtn.style.cursor = 'pointer';
        }
    }
}

// ===== CHECK NOTIFICATION STATUS =====

function checkNotificationStatus() {
    const fcmToken = localStorage.getItem('fcmToken');
    const notificationsEnabled = localStorage.getItem('notificationsEnabled') === 'true';
    
    if (fcmToken && notificationsEnabled) {
        console.log('✅ Notifications are enabled');
        updateNotificationButtonUI();
       
        return true;
    } else {
        console.log('❌ Notifications are not enabled');
        return false;
    }
}

// Check on page load
document.addEventListener('DOMContentLoaded', () => {
    checkNotificationStatus();
});

// ===== END FIREBASE CONFIGURATION =====

/* 1. ย้ายมาบนสุดกัน Error */
function getToday(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/* ===== GOOGLE LOGIN FUNCTIONS ===== */
// ฟังก์ชันเพื่อ decode JWT token
function decodeJWT(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Error decoding JWT:", e);
        return null;
    }
}

// ✅ SIMPLIFIED: ใช้ OAuth2 flow เดียว (login + drive access ทีเดียว)
function initializeGoogleLogin() {
    if (!window.google) {
        alert("Google Sign-In library ยังไม่โหลด กรุณารอสักครู่");
        return;
    }

    requestDriveAccess();  // ใช้ function เดิม แต่เปลี่ยนตรรมชาติ
}

function requestDriveAccess() {
    const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid profile email', // เอาสิทธิ์แค่ล็อกอินพื้นฐานเท่านั้น ไม่ยุ่งกับ Drive
        callback: handleGoogleLogin  
    });

    client.requestAccessToken();
}

// 🌟 ฟังก์ชันใหม่: ใช้สําหรับเปิดหน้าต่างขอสิทธิ์เซฟไฟล์ Drive โดยเฉพาะ (ปุ่มเดียวจบ ไม่มีกล่องติ๊กถูก)
// ฟังก์ชันสำหรับเปิดหน้าต่างขอสิทธิ์ Drive
function requestOnlyDrivePermission(onSuccessCallback) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file', // ขอสิทธิ์สำหรับตัวสำรองข้อมูล
            callback: (response) => {
                if (response.access_token) {
                    // เมื่อยอมรับสิทธิ์แล้ว นำรหัสไปเก็บไว้ทั้งในตัวแปร และเซฟลงความจำเครื่อง (localStorage)
                    accessToken = response.access_token;
                    localStorage.setItem("googleDriveAccessToken", accessToken);
                    
                    // สั่งให้ระบบทำงานสำรองข้อมูล หรือกู้คืนข้อมูลต่อทันที
                    if (onSuccessCallback) onSuccessCallback(); 
                }
            }
        });
        client.requestAccessToken();
    } else {
        alert("ระบบ Google กำลังโหลด กรุณารอสักครู่แล้วลองกดใหม่อีกครั้งครับ");
    }
}
function handleGoogleLogin(response) {
    try {
        const token = response.access_token;
        
        if (!token) {
            alert("ไม่สามารถได้ access token");
            return;
        }
      

        // ✅ ส่ง access token ไปที่ Google API เพื่อดึงข้อมูล user
        fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(res => res.json())
        .then(userData => {
            if (userData && userData.email) {
                console.log("Google Login Success:", userData);
                
                // เก็บข้อมูล
                localStorage.setItem("googleToken", token);
                localStorage.setItem("googleAccessToken", token);
                localStorage.setItem("googleUser", JSON.stringify({
                    email: userData.email,
                    name: userData.name || userData.email.split('@')[0],
                    picture: userData.picture,
                    loginTime: new Date().toISOString()
                }));
                
                // ✅ แสดง notification สำเร็จ
                showNotification(
                    "✅ Login สำเร็จ!",
                    `เข้าสู่ระบบ: ${userData.email}`,
                    "success"
                );
                
                // refresh หน้า
                render();
            } else {
                alert("ไม่สามารถดึงข้อมูล user ได้");
            }
        })
        .catch(err => {
            console.error("Error getting user info:", err);
            alert("เกิดข้อผิดพลาด: " + err.message);
        });

    } catch (err) {
        console.error("Login error:", err);
        showNotification("❌ Login ล้มเหลว", err.message, "error");
    }
}

function logout() {
    const token = localStorage.getItem("googleAccessToken") || accessToken;
    
    if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
        try {
            google.accounts.oauth2.revoke(token, (done) => {
                console.log("Google token revoked completely:", done);
            });
        } catch (e) {
            console.warn("Revoke failed:", e);
        }
    }

    // 🗑️ ล้างข้อมูลโปรไฟล์และการล็อกอินทั้งหมดออกจากเครื่อง
    localStorage.removeItem("googleToken");
    localStorage.removeItem("googleUser");
    localStorage.removeItem("googleAccessToken");
    localStorage.removeItem("googleDriveAccessToken"); // 🌟 ลบสิทธิ์จำ Drive ทิ้งตรงนี้
    localStorage.removeItem("lastBackupFileId");
    localStorage.removeItem("lastBackupFileName");
    localStorage.removeItem("lastBackupTimestamp");



    // 🌟 บรรทัดสำคัญ: ล้างค่าตัวแปรสิทธิ์ Drive ในระบบแอปให้เป็นว่างเปล่า
    accessToken = null;
    
    showNotification("✅ Logout สำเร็จ", "ออกจากระบบแล้ว", "success");
    render();
}

/* ===== PROGRESS BAR & NOTIFICATION SYSTEM ===== */
function showProgressModal(title = "Loading...", initialProgress = 0) {
    // สร้าง modal สำหรับแสดง progress
    const modal = document.createElement("div");
    modal.id = "progress-modal";
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        min-width: 300px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    `;

    content.innerHTML = `
        <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #333;">${title}</h3>
        <div style="width: 100%; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
            <div id="progress-bar" style="width: ${initialProgress}%; height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.3s ease;"></div>
        </div>
        <p id="progress-text" style="margin: 0; text-align: center; font-size: 14px; color: #666;">${initialProgress}%</p>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    return {
        modal,
        updateProgress: (progress) => {
            const progressBar = document.getElementById("progress-bar");
            const progressText = document.getElementById("progress-text");
            if (progressBar) progressBar.style.width = progress + "%";
            if (progressText) progressText.textContent = progress + "%";
        },
        close: () => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        }
    };
}

function showNotification(title, message, type = "success") {
    // สร้าง notification ที่โชว์ที่บนสุด
    const notification = document.createElement("div");
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === "success" ? "#4CAF50" : type === "error" ? "#f44336" : "#2196F3"};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10001;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
    `;

    notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
        <div style="font-size: 14px; opacity: 0.9;">${message}</div>
    `;

    // เพิ่ม animation
    if (!document.querySelector('style[data-notification-style]')) {
        const style = document.createElement('style');
        style.setAttribute('data-notification-style', 'true');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Auto remove หลัง 4 วินาที
    setTimeout(() => {
        notification.style.animation = "slideOutRight 0.3s ease";
        setTimeout(() => {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
        }, 300);
    }, 4000);
}


async function backupToGoogleDrive() {
    try {
        // 1. ดักเช็กก่อนเลยว่า เคยผ่านการกดปุ่ม Login ด้วย Gmail มาหรือยัง
        const isUserLoggedIn = localStorage.getItem("googleUser");
        if (!isUserLoggedIn) {
            showNotification("⚠️ ไม่สามารถบันทึกได้", "กรุณากดล็อกอินเข้าสู่ระบบ Gmail ก่อนครับ", "error");
            return; 
        }

        // 2. ดักเช็กสิทธิ์ Drive: ถ้าไม่มีถึงจะเปิดป๊อปอัป
        if (!accessToken) {
            console.log("ยังไม่มีสิทธิ์ Drive, กำลังเปิดป๊อปอัปขอสิทธิ์...");
            
            requestOnlyDrivePermission(() => {
                // เมื่อผ่านแล้ว ย้อนกลับมาสั่ง Backup ใหม่รอบนี้จะมี Token แล้ว
                backupToGoogleDrive();
            });
            return; // หยุดรอบแรกไว้ตรงนี้ เพื่อรอสิทธิ์จากป๊อปอัป
        }

        const token = accessToken;

        // ✅ แสดง progress modal
        const progress = showProgressModal("🔄 กำลัง Backup...", 0);

        // Step 1: เตรียมข้อมูล
        progress.updateProgress(20);
        await new Promise(r => setTimeout(r, 300));

        // ✅ DELETE OLD BACKUPS FIRST
        const oldBackupsRes = await fetch(
            "https://www.googleapis.com/drive/v3/files?q=name contains 'HabitBetter-Backup' and trashed=false&fields=files(id,name)&pageSize=100",
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (oldBackupsRes.ok) {
            const oldBackupsData = await oldBackupsRes.json();
            if (oldBackupsData.files && oldBackupsData.files.length > 0) {
                for (const file of oldBackupsData.files) {
                    try {
                        await fetch(
                            `https://www.googleapis.com/drive/v3/files/${file.id}`,
                            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
                        );
                    } catch (e) {
                        console.warn(`Failed to delete old backup ${file.id}:`, e);
                    }
                }
            }
        }

        const backupData = {
            tracker: localStorage.getItem("tracker"),
            way_piggy: localStorage.getItem("way_piggy"),
            saving_jars: localStorage.getItem("saving_jars"),
            titanPoints: localStorage.getItem("titanPoints"),
            notes: localStorage.getItem("notes"),
            expenses: localStorage.getItem("expenses"),
            tasks: localStorage.getItem("tasks"),
            routines: localStorage.getItem("routines"),
            my_daily_goals: localStorage.getItem("my_daily_goals"),
            my_longterm_goals: localStorage.getItem("my_longterm_goals"),
            timestamp: new Date().toISOString()
        };

        const metadata = {
            name: `HabitBetter-Backup.json`,
            mimeType: 'application/json'
        };

        const form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        form.append("file", new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" }));

        // Step 2: อัปโหลดไปยัง Google Drive
        progress.updateProgress(50);
        await new Promise(r => setTimeout(r, 300));

        const res = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }
        );

        progress.updateProgress(80);

        if (!res.ok) {
            throw new Error(`Backup failed: HTTP ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        progress.updateProgress(100);
        await new Promise(r => setTimeout(r, 300));

        if (data.id) {
            localStorage.setItem("lastBackupFileId", data.id);
            localStorage.setItem("lastBackupFileName", `HabitBetter-Backup.json`);
            localStorage.setItem("lastBackupTimestamp", new Date().toISOString());
            
            progress.close();
            showNotification("✅ Backup สำเร็จ!", `บันทึกข้อมูลลง Google Drive เรียบร้อย`, "success");
        } else {
            progress.close();
            showNotification("❌ Backup ไม่สำเร็จ", "เกิดข้อผิดพลาด กรุณาลองใหม่", "error");
        }

    } catch (err) {
        console.error(err);
        const modal = document.getElementById("progress-modal");
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        showNotification("❌ Backup ล้มเหลว", err.message, "error");
    } finally {
        // 🌟 แก้ตรงจุดนี้: เราจะลบการเคลียร์ค่าทิ้งออกไป เพื่อให้ตัวแปร accessToken อยู่ตลอดการใช้งานจนกว่าจะล็อกเอาต์
        console.log("บันทึกข้อมูลเสร็จสิ้นโดยคงสิทธิ์ Drive เอาไว้ในระบบ");
    }
}

// ===== RESTORE FUNCTION =====
/* 
 * 📝 BUG FIXES:
 * 1. เปลี่ยนจาก if statement แต่ละอัน → loop ด้วย array เพื่อให้ครบทุก key
 * 2. เพิ่มการเช็ค !== undefined && !== null เพื่อหลีกเลี่ยงค่า falsy ที่ถูกต้อง (เช่น empty array)
 * 3. เพิ่ม error handling สำหรับ HTTP response
 * 4. แสดงจำนวนรายการที่ restore ได้
 * 5. บันทึก lastBackupFileId เพื่ออ้างอิงครั้งต่อไป
 */
async function restoreFromGoogleDrive() {
    try {
        // 🌟 1. ดักเช็กก่อนว่าล็อกอิน Gmail หรือยัง
        const isUserLoggedIn = localStorage.getItem("googleUser");
        if (!isUserLoggedIn) {
            showNotification("⚠️ ไม่สามารถดึงข้อมูลได้", "กรุณากดล็อกอินเข้าสู่ระบบ Gmail ก่อนครับ", "error");
            return;
        }

        // 🌟 2. ดักเช็กสิทธิ์ Drive: บังคับอ้างอิงผ่านตัวแปรหลักเท่านั้น
        if (!accessToken) {
            requestOnlyDrivePermission(() => {
                restoreFromGoogleDrive();
            });
            return; // หยุดโค้ดรอบแรกไว้ตรงนี้
        }

        // 🌟 3. ส่งตัวแปรสิทธิ์ที่ถูกต้องให้ระบบดึงข้อมูล
        const token = accessToken;

        // ✅ แสดง progress modal
        const progress = showProgressModal("🔄 กำลัง Restore...", 0);

        // Step 1: ค้นหา backup ล่าสุด
        progress.updateProgress(20);
        await new Promise(r => setTimeout(r, 300));

        const listRes = await fetch(
            "https://www.googleapis.com/drive/v3/files?q=name='HabitBetter-Backup.json' and trashed=false&fields=files(id,name)&pageSize=1",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const listData = await listRes.json();

        if (!listData.files || listData.files.length === 0) {
            progress.close();
            showNotification("❌ ไม่พบ Backup", "ไม่พบไฟล์ backup ใน Google Drive", "error");
            return;
        }

        const latestFile = listData.files[0];

        // Step 2: ดาวน์โหลดไฟล์
        progress.updateProgress(50);
        await new Promise(r => setTimeout(r, 300));

        const fileRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${latestFile.id}?alt=media`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!fileRes.ok) {
            throw new Error(`Failed to download backup file: ${fileRes.status}`);
        }

        const backupData = await fileRes.json();

        // Step 3: Restore data
        progress.updateProgress(70);
        await new Promise(r => setTimeout(r, 300));

        // ✅ FIX: restore data ด้วย array ของ keys เพื่อให้แน่ใจว่าทุก key ถูก restore
        const keysToRestore = ['tracker', 'way_piggy', 'saving_jars', 'notes', 'expenses', 'tasks', 'routines', 'my_daily_goals', 'my_longterm_goals'];
        
        let restoredCount = 0;
        keysToRestore.forEach(key => {
            if (backupData[key] !== undefined && backupData[key] !== null) {
                localStorage.setItem(key, backupData[key]);
                restoredCount++;
            }
        });

        // ✅ FIX: บันทึก file ID เพื่อ restore ได้เร็วครั้งต่อไป
        localStorage.setItem("lastBackupFileId", latestFile.id);
        localStorage.setItem("lastBackupFileName", latestFile.name);

        progress.updateProgress(100);
        await new Promise(r => setTimeout(r, 300));
        progress.close();

        // ✅ แสดง notification สำเร็จ
        showNotification(
            "✅ Restore สำเร็จ!",
            `กู้คืน ${restoredCount} รายการ\nจาก: ${latestFile.name}`,
            "success"
        );

        // ✅ Update UI ทันที (ไม่ reload page)
        setTimeout(() => {
            window.location.reload(); 
        }, 1000);

    } catch (error) {

        console.error("Restore error:", error);

        // ปิด progress modal
        const modal = document.getElementById("progress-modal");
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        
        // ✅ แสดง notification error
        showNotification("❌ Restore ล้มเหลว", error.message, "error");
    }
}

/* ===== GOOGLE DRIVE API FUNCTIONS ===== */
/* ===== FLOATING NAVBAR FUNCTION (UPDATED - NO RECREATION) ===== */
function renderFloatingNavbar() {
    let navbar = document.getElementById("floating-navbar");
    
    // ถ้า navbar ยังไม่มี ให้สร้างใหม่
    if (!navbar) {
        navbar = document.createElement("div");
        navbar.id = "floating-navbar";
        navbar.className = "floating-navbar";
        
        const navItems = [
            { id: "home", icon: "house", label: "Home", page: "home" },
            { id: "notes", icon: "document", label: "Notes", page: "notes" },
            { id: "dashboard", icon: "grid", label: "Dashboard", page: "summary" },
            { id: "savings", icon: "wallet", label: "Savings", page: "saving" },
            { id: "settings", icon: "gear", label: "Settings", page: "settings" }
        ];
        
        navItems.forEach((item, index) => {
            const btn = document.createElement("button");
            btn.className = "navbar-btn";
            btn.setAttribute("data-page", item.page);
            btn.innerHTML = `<span class="navbar-icon" data-icon="${item.icon}"></span><span class="navbar-label">${item.label}</span>`;
            btn.onclick = () => {
                currentPage = item.page;
                render();
            };
            
            navbar.appendChild(btn);
        });
        
        document.body.appendChild(navbar);
    }
    
    // อัพเดต active state (Dashboard เป็นปุ่มหลักตั้งแต่เริ่มต้น)
    const buttons = navbar.querySelectorAll(".navbar-btn");
    buttons.forEach(btn => {
        btn.classList.remove("navbar-btn-active");
        // Dashboard จะเป็น active ตั้งแต่เริ่ม เสมอ (ไม่เปลี่ยนตาม currentPage)
        if (btn.getAttribute("data-page") === "summary") {
            btn.classList.add("navbar-btn-active");
        }
    });
}

/* ===== GLOBAL STATE ===== */
let currentPage = "home"; 
let data = JSON.parse(localStorage.getItem("tracker")) || Array(144).fill(0);
let lastClickDate = localStorage.getItem("lastClickDate") || "";
let history = [];
let adminMode = false;
let soundEnabled = localStorage.getItem("sound") !== "false";
let zoomLevel = parseFloat(localStorage.getItem("zoomLevel")) || 1.0;

let piggyBank = JSON.parse(localStorage.getItem("way_piggy")) || 0; 
let pendingDeposit = 0; // ยอดที่รอการกดยืนยัน

/* ===== SAVING JARS STATE (NEW) ===== */
let savingJars = JSON.parse(localStorage.getItem("saving_jars")) || [];
let activeJarId = localStorage.getItem("active_jar_id") || null;
let jarPendingDeposit = 0;
// --- เพิ่มบรรทัดนี้เพื่อเก็บคะแนนสะสม ---
// 🗑️ ลบ titanPoints - ระบบ shop ถูกลบแล้ว
/* --- [แทรกเพิ่ม] ระบบ Zoom แยกหน้า --- */
let pageZooms = JSON.parse(localStorage.getItem("pageZooms")) || {
    home: 1.0, daily: 1.0, pomodoro: 1.0, expense: 1.0, longterm: 1.0, notes: 1.0, tvm: 1.0, routine: 1.0
};

/* --- [แทรกเพิ่ม] ระบบเก็บลำดับเมนู --- */
let menuOrder = JSON.parse(localStorage.getItem("menuOrder")) || [
    "tracker", "routine", "daily", "pomodoro", "expense", "longterm", "notes", "tvm"
];

/* --- [เพิ่ม] ตัวแปร toggle สำหรับปุ่มพิเศษ --- */
let specialButtonsVisible = localStorage.getItem("specialButtonsVisible") === "true";
// Default ปิดไว้ ถ้าไม่มีค่าใน localStorage
if (!localStorage.getItem("specialButtonsVisible")) {
    localStorage.setItem("specialButtonsVisible", "false");
    specialButtonsVisible = false;
}

/* --- [เพิ่ม] รายการอิโmoจิสำหรับเลือกกระปุก --- */
const JAR_EMOJI_OPTIONS = [
    { emoji: '💰', label: 'ถุงเงินทอง' },
    { emoji: '📱', label: 'โทรศัพท์' },
    { emoji: '🏠', label: 'บ้าน' },
    { emoji: '🚗', label: 'รถ' },
    { emoji: '⌚', label: 'นาฬิกา' },
    { emoji: '💊', label: 'ยา' },
    { emoji: '🐶', label: 'สัตว์เลี้ยง' },
    { emoji: '🏢', label: 'คอนโด' },
    { emoji: '✈️', label: 'ท่องเที่ยว' },
    { emoji: '🎮', label: 'เกม' },
    { emoji: '📚', label: 'หนังสือ' },
    { emoji: '👗', label: 'เสื้อผ้า' },
    { emoji: '💻', label: 'คอมพิวเตอร์' },
    { emoji: '🎵', label: 'ดนตรี' },
    { emoji: '🍕', label: 'อาหาร' },
    { emoji: '⚽', label: 'กีฬา' }
];
// ลบ "saving" ออกจาก menuOrder ถ้ามีอยู่ (ย้ายไปอยู่ใน tracker modal แล้ว)
if (menuOrder.includes("saving")) {
    menuOrder = menuOrder.filter(id => id !== "saving");
    localStorage.setItem("menuOrder", JSON.stringify(menuOrder));
}

// 🗑️ ลบ totalExp และ EXP system - ระบบ EXP ถูกลบแล้ว

/* --- [เพิ่ม] ฟังก์ชันคำนวณยอดรวมออมทุกกระปุก --- */
function getTotalSavingsFromAllJars() {
    return savingJars.reduce((total, jar) => total + (jar.saved || 0), 0);
}

/* POMODORO STATE */
const DEFAULT_POMO_SETTINGS = { focus: 25, short: 5, long: 15 };
let pomoSettings = JSON.parse(localStorage.getItem("pomoSettings")) || DEFAULT_POMO_SETTINGS;
let pomoTime = (parseInt(pomoSettings.focus) || DEFAULT_POMO_SETTINGS.focus) * 60;
let pomoInterval = null;
let isPomoRunning = false;
let pomoMode = "focus"; 
let pomoEndAt = null;
let pomoCompletedFocusInCycle = parseInt(localStorage.getItem("pomoCompletedFocusInCycle") || "0");
const pomoAlarm = new Audio("https://videotourl.com/audio/1778680880748-9ce6988b-fcb3-4e42-aedb-5a126611271c.mp3");

/* ===== ACHIEVEMENT/BADGE SYSTEM ===== */
let unlockedBadges = JSON.parse(localStorage.getItem("unlockedBadges")) || [];
let badgeLastCheckDate = localStorage.getItem("badgeLastCheckDate") || "";
/* =========================================
   TITAN SHOP DATA (รายการสินค้าในร้านค้า)
========================================= */
// แก้ไขส่วนนี้ในไฟล์ script.js
// 🗑️ ลบ SHOP_ITEMS - ระบบสกินถูกลบแล้ว
const SHOP_ITEMS = [];

// 🗑️ ลบ ownedItems และ equippedItems - ระบบสกินถูกลบแล้ว
const BADGE_LIST = [
    // 📅 Tracker Badges (720 Day Tracker ถูกลบแล้ว)
    
    // 💎 SAVING JARS BADGES (อันดับแรก!)
    { id: "first_jar", emoji: "🏺", name: "Jar Creator", desc: "สร้างกระปุกออมเงินครั้งแรก", condition: () => savingJars.length > 0, category: "saving" },
    { id: "jar_1k", emoji: "💵", name: "Pocket Saver", desc: "เก็บเงินในกระปุก ครบ 1,000 บาท", condition: () => getTotalSavingJarsAmount() >= 1000, category: "saving" },
    { id: "jar_3k", emoji: "💴", name: "Growing Saver", desc: "เก็บเงินในกระปุก ครบ 3,000 บาท", condition: () => getTotalSavingJarsAmount() >= 3000, category: "saving" },
    { id: "jar_5k", emoji: "💶", name: "Dedicated Saver", desc: "เก็บเงินในกระปุก ครบ 5,000 บาท", condition: () => getTotalSavingJarsAmount() >= 5000, category: "saving" },
    { id: "jar_10k", emoji: "💷", name: "Serious Saver", desc: "เก็บเงินในกระปุก ครบ 10,000 บาท", condition: () => getTotalSavingJarsAmount() >= 10000, category: "saving" },
    { id: "jar_20k", emoji: "💰", name: "Savings Champion", desc: "เก็บเงินในกระปุก ครบ 20,000 บาท", condition: () => getTotalSavingJarsAmount() >= 20000, category: "saving" },
    { id: "jar_50k", emoji: "🏆", name: "Saving Master", desc: "เก็บเงินในกระปุก ครบ 50,000 บาท", condition: () => getTotalSavingJarsAmount() >= 50000, category: "saving" },
    { id: "jar_100k", emoji: "👑", name: "Financial Legend", desc: "เก็บเงินในกระปุก ครบ 100,000 บาท", condition: () => getTotalSavingJarsAmount() >= 100000, category: "saving" },
    { id: "multi_jar", emoji: "🎯", name: "Multi-Goal Saver", desc: "สร้างกระปุก 5 อัน", condition: () => savingJars.length >= 5, category: "saving" },
    
    // 💰 Expense & Income Tracking Badges
    { id: "first_expense", emoji: "💳", name: "Budget Starter", desc: "บันทึกรายการครั้งแรก", condition: () => myExpenses.length > 0 || myExpenseArchive.length > 0, category: "expense" },
    
    { id: "daily_logger", emoji: "📅", name: "Daily Logger", desc: "บันทึกรายการในวันนี้", condition: () => myExpenses.length > 0, category: "expense" },
    
    { id: "week_tracker", emoji: "📊", name: "Consistent Tracker", desc: "บันทึก expense ติดต่อ 7 วัน", condition: () => getExpenseStreak() >= 7, category: "expense" },
    
    { id: "fortnight_tracker", emoji: "🔥", name: "Fortnight Warrior", desc: "บันทึก expense ติดต่อ 14 วัน", condition: () => getExpenseStreak() >= 14, category: "expense" },
    
    { id: "month_tracker", emoji: "🎯", name: "Monthly Champion", desc: "บันทึก expense ติดต่อ 30 วัน", condition: () => getExpenseStreak() >= 30, category: "expense" },
    
    { id: "century_recorder", emoji: "💯", name: "Century Recorder", desc: "บันทึกได้ 100 รายการ", condition: () => getTotalExpenseRecords() >= 100, category: "expense" },
    
    { id: "record_keeper", emoji: "📚", name: "Record Keeper", desc: "บันทึกได้ 500 รายการ", condition: () => getTotalExpenseRecords() >= 500, category: "expense" },
    
    { id: "budget_master", emoji: "🎨", name: "Budget Master", desc: "บันทึกรายการในแต่ละหมวดหมู่ครบ 10 แบบ", condition: () => getUniqueCategories() >= 10, category: "expense" },
    
    { id: "expense_sentinel", emoji: "💸", name: "Expense Sentinel", desc: "บันทึกรายจ่ายสะสม ≥ 50,000 บาท", condition: () => getCurrentMonthExpenses() >= 50000, category: "expense" },
    
    { id: "income_warrior", emoji: "💰", name: "Income Warrior", desc: "บันทึกรายรับสะสม ≥ 100,000 บาท", condition: () => getCurrentMonthIncome() >= 100000, category: "expense" },
    
    { id: "balanced_life", emoji: "⚖️", name: "Balanced Life", desc: "รายรับ > รายจ่ายติดต่อ 7 วัน", condition: () => checkBalancedDays() >= 7, category: "expense" },
    
    { id: "night_owl", emoji: "🌙", name: "Night Owl", desc: "บันทึกหลัง 20:00 น. จำนวน 5 ครั้ง", condition: () => countNightLogs() >= 5, category: "expense" },
    
    { id: "early_bird", emoji: "🌅", name: "Early Bird", desc: "บันทึกตั้งแต่ 05:00-08:00 น. จำนวน 5 ครั้ง", condition: () => countEarlyBirdLogs() >= 5, category: "expense" },
    
    // 🍅 Pomodoro Badges
    { id: "first_pomo", emoji: "🍅", name: "Pomodoro Starter", desc: "Focus session ครั้งแรก", condition: () => parseInt(localStorage.getItem("pomoCount") || "0") > 0, category: "pomodoro" },
    { id: "speed_demon", emoji: "⚡", name: "Speed Demon", desc: "Pomodoro focus session ≥ 10 ครั้ง", condition: () => parseInt(localStorage.getItem("pomoCount") || "0") >= 10, category: "pomodoro" },
    { id: "focus_marathon", emoji: "🚀", name: "Focus Marathon", desc: "รวม focus time ≥ 100 นาที", condition: () => parseInt(localStorage.getItem("pomoFocusMinutes") || "0") >= 100, category: "pomodoro" },
    
    // 🎯 Goals Badges
    { id: "first_goal", emoji: "🎯", name: "Goal Setter", desc: "สร้างเป้าหมายครั้งแรก", condition: () => myDailyGoals.length > 0 || myLongTermGoals.length > 0, category: "goals" },
    { id: "goal_master", emoji: "✅", name: "Goal Master", desc: "เช็คครบ 50 goal", condition: () => parseInt(localStorage.getItem("goalsCompleted") || "0") >= 50, category: "goals" },
  { 
        id: "goal_veteran", 
        emoji: "🏅", 
        name: "Goal Veteran", 
        desc: "เช็คครบ 100 goal", 
        condition: () => parseInt(localStorage.getItem("goalsCompleted") || "0") >= 100, 
        category: "goals"
    },
    { 
        id: "goal_legend", 
        emoji: "🎖️", 
        name: "Goal Legend", 
        desc: "เช็คครบ 300 goal", 
        condition: () => parseInt(localStorage.getItem("goalsCompleted") || "0") >= 300, 
        category: "goals"
    },
    { 
        id: "goal_titan", 
        emoji: "🌌", 
        name: "Goal Titan", 
        desc: "เช็คครบ 500 goal", 
        condition: () => parseInt(localStorage.getItem("goalsCompleted") || "0") >= 500, 
        category: "goals"
    },
    { id: "perfect_day", emoji: "💯", name: "Perfect Day", desc: "เช็คครบทุก daily goal ใน 1 วัน", condition: () => checkPerfectDay(), category: "goals" },
    
    
    // ⭐ Level Badges (ถูกลบแล้ว - ไม่มีระบบ level)
    
    // 📝 Notes Badges
    { id: "first_note", emoji: "📝", name: "Note Writer", desc: "เขียน Note ครั้งแรก", condition: () => myNotes.length > 0, category: "notes" },
    { id: "note_collector", emoji: "📚", name: "Knowledge Keeper", desc: "เก็บ notes ได้ 10 อัน", condition: () => myNotes.length >= 10, category: "notes" },
    
    // 🔒 Hidden Badge
    { id: "hidden_secret", emoji: "🎁", name: "Secret Achievement", desc: "ปลดล็อคเมื่อปลดล็อค 10 badge", condition: () => unlockedBadges.length >= 10, category: "hidden" }
]; 

/* ===== EXPENSE CATEGORIES ===== */
const defaultIncomeCategories = [
  { id: 'salary', name: 'เงินเดือน', emoji: '💼' },
  { id: 'overtime', name: 'ล่วงเวลา', emoji: '⏰' },
  { id: 'online_sell', name: 'ขายออนไลน์', emoji: '👜' },
  { id: 'bonus', name: 'โบนัส', emoji: '🎁' },
  { id: 'interest', name: 'ดอกเบี้ย', emoji: '📈' },
  { id: 'freelance', name: 'งานพิเศษ', emoji: '💻' },
  { id: 'gift', name: 'ของขวัญ', emoji: '🎀' },
  { id: 'refund', name: 'คืนเงิน', emoji: '💳' },
];

const defaultExpenseCategories = [
  // 🍽️ อาหาร & เครื่องดื่ม
  { id: 'food', name: 'อาหาร', emoji: '🍜' },
  { id: 'coffee', name: 'กาแฟ', emoji: '☕' },
  { id: 'drink', name: 'เครื่องดื่ม', emoji: '🥤' },
  { id: 'snack', name: 'ขนมขบเคี้ยว', emoji: '🍿' },
  { id: 'alcohol', name: 'เครื่องดื่มแอลกอฮอล์', emoji: '🍺' },
  
  // 🚗 การเดินทาง
  { id: 'bus', name: 'ค่าเดินทาง', emoji: '🚌' },
  { id: 'taxi', name: 'แท็กซี่', emoji: '🚕' },
  { id: 'parking', name: 'ค่าจอดรถ', emoji: '🅿️' },
  { id: 'gas', name: 'น้ำมันรถ', emoji: '⛽' },
  
  // 🛍️ ช้อปปิ้ง & ของใช้
  { id: 'online_shop', name: 'ซื้อออนไลน์', emoji: '🛍️' },
  { id: 'clothes', name: 'เสื้อผ้า', emoji: '👕' },
  { id: 'tools', name: 'เครื่องมือ/อะไหล่', emoji: '🔧' },
  
  // 🏠 ที่อยู่ & สาธารณูปโภค
  { id: 'rent', name: 'ค่าเช่า', emoji: '🏠' },
  { id: 'electricity', name: 'ค่านำ้ไฟ', emoji: '⚡' },
  { id: 'water', name: 'ค่าน้ำ', emoji: '💧' },
  { id: 'internet', name: 'ค่าอินเทอร์เน็ต', emoji: '📡' },
  { id: 'phone', name: 'ค่าโทรศัพท์', emoji: '📱' },
  
  // 💰 การเงิน & ผ่อนชำระ
  { id: 'car_loan', name: 'ผ่อนรถ', emoji: '🚗' },
  { id: 'house_loan', name: 'ผ่อนบ้าน', emoji: '🏡' },
  { id: 'debt', name: 'ผ่อนจ่ายอื่นๆ', emoji: '💳' },
  { id: 'insurance', name: 'ประกัน', emoji: '📋' },
  
  // 👨‍👩‍👧 ครอบครัว
  { id: 'parents', name: 'ส่งเงินพ่อแม่', emoji: '👨‍👩‍👧' },
  { id: 'kids', name: 'ลูกๆ', emoji: '👶' },
  
  // 🎮 ความบันเทิง
  { id: 'gaming', name: 'เกม', emoji: '🎮' },
  { id: 'movie', name: 'หนัง', emoji: '🎬' },
  { id: 'hobby', name: 'งานอดิเรก', emoji: '🎨' },
  
  // 🏥 สุขภาพ
  { id: 'medicine', name: 'ยา/เวชภัณฑ์', emoji: '💊' },
  { id: 'hospital', name: 'โรงพยาบาล', emoji: '🏥' },
  
  // ✂️ บริการ
  { id: 'haircut', name: 'ตัดผม', emoji: '✂️' },
  { id: 'laundry', name: 'ซักรีด', emoji: '👔' },
  
  // 🐷 เงินออม
  { id: 'savings', name: 'เงินออม', emoji: '🐷' },
];

let myIncomeCategories = JSON.parse(localStorage.getItem("my_income_categories")) || defaultIncomeCategories;
let myExpenseCategories = JSON.parse(localStorage.getItem("my_expense_categories")) || defaultExpenseCategories;
// ✅ แก้คำผิด / อัปเดตชื่อหมวดหมู่รายรับที่เคยถูกเซฟไว้ใน localStorage
const incomeNameFixes = {
    overtime: "ล่วงเวลา",
    online_sell: "ขายออนไลน์",
    salary: "เงินเดือน",
    bonus: "โบนัส",
    interest: "ดอกเบี้ย",
    freelance: "งานพิเศษ",
    gift: "ของขวัญ",
    refund: "คืนเงิน"
};

myIncomeCategories = myIncomeCategories.map(cat => {
    if (incomeNameFixes[cat.id]) {
        return { ...cat, name: incomeNameFixes[cat.id] };
    }
    return cat;
});

localStorage.setItem("my_income_categories", JSON.stringify(myIncomeCategories));


// ✅ แก้คำผิด / อัปเดตชื่อหมวดหมู่รายจ่ายที่เคยถูกเซฟไว้ใน localStorage
const expenseNameFixes = {
    food: "อาหาร",
    coffee: "กาแฟ",
    drink: "เครื่องดื่ม",
    snack: "ขนมขบเคี้ยว",
    alcohol: "เครื่องดื่มแอลกอฮอล์",
    bus: "ค่าเดินทาง",
    taxi: "แท็กซี่",
    parking: "ค่าจอดรถ",
    gas: "น้ำมันรถ",
    online_shop: "ซื้อออนไลน์",
    clothes: "เสื้อผ้า",
    tools: "เครื่องมือ/อะไหล่",
    rent: "ค่าเช่า",
    electricity: "ค่าไฟ",
    water: "ค่าน้ำ",
    internet: "ค่าอินเทอร์เน็ต",
    phone: "ค่าโทรศัพท์",
    car_loan: "ผ่อนรถ",
    house_loan: "ผ่อนบ้าน",
    debt: "ผ่อนจ่ายอื่นๆ",
    insurance: "ประกัน",
    parents: "ส่งเงินพ่อแม่",
    kids: "ลูกๆ",
    gaming: "เกม",
    movie: "หนัง",
    hobby: "งานอดิเรก",
    medicine: "ยา/เวชภัณฑ์",
    hospital: "โรงพยาบาล",
    haircut: "ตัดผม",
    laundry: "ซักรีด",
    savings: "เงินออม"
};

myExpenseCategories = myExpenseCategories.map(cat => {
    if (expenseNameFixes[cat.id]) {
        return { ...cat, name: expenseNameFixes[cat.id] };
    }
    return cat;
});

localStorage.setItem("my_expense_categories", JSON.stringify(myExpenseCategories));

/* EXPENSE STATE (Manual Mode) */
let myExpenses = JSON.parse(localStorage.getItem("my_expenses")) || [];
let myExpenseArchive = JSON.parse(localStorage.getItem("my_expense_archive")) || [];
let lastExpenseResetDate = localStorage.getItem("lastExpenseResetDate") || getToday();

/* NOTES STATE & LOCK */
let myNotes = JSON.parse(localStorage.getItem("my_notes")) || [];
let editingNoteId = null; 
let unlockedNotes = []; 

/* ROUTINE STATE */
let myRoutines = JSON.parse(localStorage.getItem("my_routines")) || [
    { time: "07:00", task: "ตื่นนอน/ดื่มน้ำ" },
    { time: "23:00", task: "เข้านอน" }
];

const ADMIN_PASSWORD = "1234";
const clickSound = new Audio("https://videotourl.com/audio/1778680657819-b2fdb392-1f6b-43f6-b147-ba5a12cc06f8.mp3");

const myQuotes = [
    "วันนี้คุณเก่งกว่าเมื่อวานแล้ว",
    "ความสำเร็จเริ่มจากก้าวเล็กๆ",
    "วินัยคือกุญแจสำคัญสู่เป้าหมาย",
    "อย่าเพิ่งยอมแพ้ เป้าหมายอยู่อีกไม่ไกล",
    "ความสม่ำเสมอคือพลังที่ยิ่งใหญ่ที่สุด",
    "เริ่มตอนนี้ ดีกว่าเสียใจภายหลัง",
    "ทุกความพยายามไม่มีคำว่าสูญเปล่า",
    "Focus on the step, not the mountain.",
    "Nothing really change. Untill i change myself.",
    "ถ้าเงินแก้ปัญหาไม่ได้ แสดงว่าเงินมึงไม่พอ"
];

/* ===== DATA FOR GOALS ===== */
let myDailyGoals = JSON.parse(localStorage.getItem("my_daily_goals")) || [{ text: "ดื่มน้ำวันละ 2 ลิตร", done: false }];
let lastGoalResetDate = localStorage.getItem("lastGoalResetDate") || "";
let myLongTermGoals = JSON.parse(localStorage.getItem("my_longterm_goals")) || [{ text: "เป้าหมายระยะยาวของคุณ", done: false }];
function resetDailyGoalsIfNeeded() {
    const today = new Date().toDateString();

    // ถ้ายังไม่เคย reset วันนี้
    if (lastGoalResetDate !== today) {

        // รีเซ็ต goal ทุกอัน
        myDailyGoals.forEach(goal => {
            goal.done = false;
        });

        // บันทึกว่าวันนี้ reset แล้ว
        lastGoalResetDate = today;

        // save ลง localStorage
        save();

        console.log("Daily goals reset!");
    }
}

// 💰 AUTO ARCHIVE EXPENSE ถูกปิดแล้ว
// เพราะ finishAddExpense() บันทึกเข้า myExpenseArchive ทันทีอยู่แล้ว
function autoArchiveExpenseIfNeeded() {
    // ไม่ต้องทำอะไร เพื่อกันบันทึกซ้ำตอนข้ามวัน
}

// 🔴 TRACKER RESET (ทำเหมือนกับ Daily Goals เด้ง!)
let lastTrackerResetDate = localStorage.getItem("lastTrackerResetDate") || "";
function resetTrackerIfNeeded() {
    const today = new Date().toDateString(); // ใช้เดียวกับ Daily Goals
    
    if (lastTrackerResetDate !== today) {
        console.log(`🔥 TRACKER RESET! ${lastTrackerResetDate} → ${today}`);
        lastClickDate = ""; // ล้างสถานะ
        lastTrackerResetDate = today; // บันทึกวันรีเซ็ต
        save();
        console.log("✅ Tracker lock cleared!");
    }
}

function resetTrackerLockIfNeeded() {
    const today = getToday(); 
    console.log(`[TRACKER CHECK] today: ${today}, lastClickDate: ${lastClickDate}`);
    if (lastClickDate && lastClickDate !== today) {
        console.log(`🔄 RESET! Changing from ${lastClickDate} to ${today}`);
        lastClickDate = ""; // ล้างสถานะการขีดของวันเก่า
        save();
        console.log("✅ Tracker lock reset complete!");
    }
}

/* ===== SAVE & CLOUD SYNC LOGIC ===== */

/* ===== BADGE CHECKING FUNCTIONS ===== */
function checkStreak(days) {
    if (data.length === 0) return false;
    
    // เช็คจาก data array ว่ามีขีดติดต่อกันกี่วัน
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
        if (data[i] > 0) {
            streak++;
        } else {
            break;
        }
    }
    return streak >= days;
}

function checkExpenseStreak(days) {
    if (myExpenseArchive.length === 0) return false;
    
    // เก็บ unique dates ของ expense
    const uniqueDates = [...new Set(myExpenseArchive.map(a => 
        new Date(a.date).toDateString()
    ))].sort();
    
    if (uniqueDates.length < days) return false;
    
    // เช็คว่ามีติดต่อกันกี่วัน
    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
        const prev = new Date(uniqueDates[i-1]).getTime();
        const curr = new Date(uniqueDates[i]).getTime();
        const daysDiff = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 1) {
            streak++;
        } else {
            break;
        }
    }
    return streak >= days;
}

// 🆕 ได้ current streak วันติดต่อ
function getExpenseStreak() {
    if (myExpenseArchive.length === 0) return 0;
    
    const uniqueDates = [...new Set(myExpenseArchive.map(a => 
        new Date(a.date).toDateString()
    ))].sort().reverse(); // เรียงจากใหม่ไปเก่า
    
    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
        const curr = new Date(uniqueDates[i-1]).getTime();
        const prev = new Date(uniqueDates[i]).getTime();
        const daysDiff = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 1) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

// 🆕 ได้จำนวนรายการทั้งหมด
function getTotalExpenseRecords() {
    return myExpenses.length + myExpenseArchive.reduce((sum, record) => {
        return sum + (record.items?.length || 0);
    }, 0);
}

// 🆕 ได้รายจ่ายในเดือนนี้
function getCurrentMonthExpenses() {
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    let total = 0;
    
    myExpenseArchive.forEach(record => {
        if (record.date.substring(0, 7) === currentMonth) {
            total += record.totalOut || 0;
        }
    });
    
    return total;
}

// 🆕 ได้รายรับในเดือนนี้
function getCurrentMonthIncome() {
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    let total = 0;
    
    myExpenseArchive.forEach(record => {
        if (record.date.substring(0, 7) === currentMonth) {
            total += record.totalIn || 0;
        }
    });
    
    return total;
}

// 🆕 ได้จำนวนหมวดหมู่ที่บันทึกแล้ว
function getUniqueCategories() {
    const categories = new Set();
    
    myExpenses.forEach(expense => {
        if (expense.categoryId) categories.add(expense.categoryId);
    });
    
    myExpenseArchive.forEach(record => {
        if (record.items) {
            record.items.forEach(item => {
                if (item.categoryId) categories.add(item.categoryId);
            });
        }
    });
    
    return categories.size;
}

// 🆕 เช็คว่ารายรับ > รายจ่ายติดต่อกี่วัน
function checkBalancedDays() {
    if (myExpenseArchive.length === 0) return 0;
    
    const sorted = [...myExpenseArchive].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    let streak = 0;
    for (const record of sorted) {
        if ((record.totalIn || 0) > (record.totalOut || 0)) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

// 🆕 นับการบันทึกหลัง 20:00 น.
function countNightLogs() {
    let count = 0;
    
    myExpenses.forEach(expense => {
        if (expense.time) {
            const hour = parseInt(expense.time.split(':')[0]);
            if (hour >= 20) count++;
        }
    });
    
    myExpenseArchive.forEach(record => {
        if (record.items) {
            record.items.forEach(item => {
                if (item.time) {
                    const hour = parseInt(item.time.split(':')[0]);
                    if (hour >= 20) count++;
                }
            });
        }
    });
    
    return count;
}

// 🆕 นับการบันทึก 05:00-08:00 น.
function countEarlyBirdLogs() {
    let count = 0;
    
    myExpenses.forEach(expense => {
        if (expense.time) {
            const hour = parseInt(expense.time.split(':')[0]);
            if (hour >= 5 && hour < 8) count++;
        }
    });
    
    myExpenseArchive.forEach(record => {
        if (record.items) {
            record.items.forEach(item => {
                if (item.time) {
                    const hour = parseInt(item.time.split(':')[0]);
                    if (hour >= 5 && hour < 8) count++;
                }
            });
        }
    });
    
    return count;
}

function checkPerfectDay() {
    if (myDailyGoals.length === 0) return false;
    // เช็คว่า Daily Goal ทั้งหมดเสร็จแล้วในวันนี้
    return myDailyGoals.every(g => g.done);
}

// 💰 คำนวณเงินออม จาก Tracker (1 ขีด = 300 บาท)
function calculateTrackerSavings() {
    const totalTicks = data.reduce((a, b) => a + b, 0);
    return totalTicks * 300; // 1 ขีด = 300 บาท
}

// 💰 คำนวณเงินรวมในกระปุกออมเงิน (Saving Jars)
function getTotalSavingJarsAmount() {
    let total = 0;
    savingJars.forEach(jar => {
        total += jar.saved || 0;  // ใช้ jar.saved เหมือนเดิม
    });
    return total;
}

// 💰 คำนวณเงินออม จาก Expense Archive
function calculateTotalSavings() {
    let totalSavings = 0;
    
    // คำนวณจาก myExpenseArchive (บันทึกแล้ว)
    myExpenseArchive.forEach(record => {
        totalSavings += record.balance || record.total || 0;
    });
    
    return totalSavings;
}
function playUnlockSound() {
    // ใช้เสียง Ting สั้นๆ จากอินเทอร์เน็ต
    const audio = new Audio('https://videotourl.com/audio/1778850270009-6a533290-c6e9-4252-b8e0-e448da441a28.mp3'); 
    audio.volume = 0.5; // ปรับความดังระดับกลางๆ
    audio.play().catch(e => console.log("รอผู้ใช้กดหน้าจอก่อนถึงจะเล่นเสียงได้"));
}
function updateAchievements() {
    // 🔥 เอาเช็คแค่ 1 ครั้งต่อวันออก เพื่อให้ปลดล็อค badge ได้ตลอด!
    
    BADGE_LIST.forEach(badge => {
        if (!unlockedBadges.includes(badge.id) && badge.condition()) {
            unlockedBadges.push(badge.id);
            // 🗑️ ลบ titanPoints - ไม่มีระบบ points อีกต่อไป
            localStorage.setItem("unlockedBadges", JSON.stringify(unlockedBadges));
            
            // เล่น animation เมื่อปลดล็อค badge
            showBadgeNotification(badge);
            playUnlockSound();
            console.log(`🎉 Badge Unlocked: ${badge.name}`);
        }
    });
}

function showBadgeNotification(badge) {
    const notif = document.createElement("div");
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: bold;
        animation: slideIn 0.5s ease-out;
        font-size: 16px;
    `;
    notif.innerHTML = `<div style="font-size:32px; margin-bottom:8px;">${badge.emoji}</div>
        <div>Badge Unlocked!</div>
        <div style="font-size:12px; opacity:0.9;">${badge.name}</div>`;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.animation = "slideOut 0.5s ease-out";
        setTimeout(() => notif.remove(), 500);
    }, 3000);
}

function getUnlockedBadgesForDisplay() {
    return BADGE_LIST.filter(b => unlockedBadges.includes(b.id));
}

/* ===== SAVE & CLOUD SYNC LOGIC ===== */
function save() {
    localStorage.setItem("tracker", JSON.stringify(data));
    localStorage.setItem("lastClickDate", lastClickDate);
    localStorage.setItem("my_daily_goals", JSON.stringify(myDailyGoals));
    localStorage.setItem("my_longterm_goals", JSON.stringify(myLongTermGoals));
    localStorage.setItem("my_notes", JSON.stringify(myNotes));
    localStorage.setItem("my_expenses", JSON.stringify(myExpenses));
    localStorage.setItem("my_expense_archive", JSON.stringify(myExpenseArchive));
    localStorage.setItem("lastExpenseResetDate", lastExpenseResetDate);
    
    localStorage.setItem("lastGoalResetDate", lastGoalResetDate);
    localStorage.setItem("lastTrackerResetDate", lastTrackerResetDate);
    localStorage.setItem("zoomLevel", zoomLevel);
    // 🗑️ ลบ totalExp และ titanPoints - ระบบลบแล้ว
    localStorage.setItem("my_routines", JSON.stringify(myRoutines));
    localStorage.setItem("pageZooms", JSON.stringify(pageZooms));
    localStorage.setItem("menuOrder", JSON.stringify(menuOrder));
    localStorage.setItem("saving_jars", JSON.stringify(savingJars));
    localStorage.setItem("active_jar_id", activeJarId || "");
    localStorage.setItem("unlockedBadges", JSON.stringify(unlockedBadges));
    // 🗑️ ลบ ownedItems และ equippedItems - ระบบสกินถูกลบแล้ว
}

/* ===== LEVEL & CONFETTI SYSTEM (ถูกลบแล้ว) ===== */
function addExp(amount) {
    // 🗑️ ระบบ EXP ถูกลบแล้ว - function นี้ว่างไว้เพื่อไม่ให้ code อื่นพัง
}

/* ===== SAVING EXP CALCULATION ===== */
function calculateSavingExp(amount) {
    // 🗑️ ระบบ EXP ถูกลบแล้ว
    return 0;
}

function triggerConfetti() {
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-piece';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        confetti.style.opacity = Math.random();
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 5000);
    }
}

// ✅ ลบฟังก์ชัน syncToCloud ออก - ไม่ส่งข้อมูลไป Google Sheets อีกต่อไป

// ✅ ลบฟังก์ชัน restoreFromCloud ออก - ไม่ดึงข้อมูลจาก Google Sheets อีกต่อไป

/* แก้ไขเฉพาะฟังก์ชัน applyZoom */
function applyZoom() {
    // ให้ซูมเฉพาะตัวแอป (app) ไม่ต้องซูม body
    app.style.zoom = pageZooms[currentPage] || 1.0;
    // บังคับให้พื้นหลัง (body) มีขนาดปกติเสมอ สีจะได้ไม่แตก
    document.body.style.zoom = "1.0";
}

/* NOTE: applyZoom ใช้ pageZooms[currentPage] ดังนั้นปุ่ม zoom ทุกหน้าต้องเขียนลง pageZooms */

/* ===== CLOCK LOGIC ===== */
function updateHomeClock() {
    const timeEl = document.getElementById("home-time");
    const dateEl = document.getElementById("home-date");
    if (!timeEl || !dateEl) return;
    const now = new Date();
    timeEl.innerText = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    dateEl.innerText = now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (currentPage === "home") setTimeout(updateHomeClock, 1000);
}

/* ===== UI COMPONENTS ===== */
/* ===== SETTINGS DRAWER ===== */
let settingsOpen = false;

const settingsBtn = document.createElement("button");
settingsBtn.className = "settings-btn";
settingsBtn.style.display = specialButtonsVisible ? "block" : "none";
settingsBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="11" height="11" rx="3" fill="currentColor"/>
  <rect x="15" y="2" width="11" height="11" rx="3" fill="currentColor"/>
  <rect x="2" y="15" width="11" height="11" rx="3" fill="currentColor"/>
  <rect x="15" y="15" width="11" height="11" rx="3" fill="currentColor"/>
</svg>`;
settingsBtn.onclick = () => {
    settingsOpen = !settingsOpen;
    const drawer = document.getElementById("settings-drawer");
    if (drawer) {
        drawer.classList.toggle("visible", settingsOpen);
        drawer.classList.toggle("hidden", !settingsOpen);
    }
};

const themes = ["dark", "matrix", "cyberpunk", "midnight", "autumn", "sakura"];
const themeIcons = { dark: "🌙", matrix: "🟢", cyberpunk: "🌆", midnight: "💜", autumn: "🍂", sakura: "🌸" };

const themeBtn = document.createElement("button");
themeBtn.className = "theme-btn";
themeBtn.style.cssText = "position:relative;top:auto;right:auto;box-shadow:none;";
themeBtn.style.display = specialButtonsVisible ? "block" : "none";

function applyTheme(theme) {
    document.body.classList.remove("dark-mode", "matrix-mode", "cyberpunk-mode", "light-mode", "midnight-mode", "autumn-mode", "sakura-mode");
    if (theme === "dark") document.body.classList.add("dark-mode");
    if (theme === "matrix") document.body.classList.add("matrix-mode");
    if (theme === "cyberpunk") document.body.classList.add("cyberpunk-mode");
    if (theme === "midnight") document.body.classList.add("midnight-mode");
    if (theme === "autumn") document.body.classList.add("autumn-mode");
    if (theme === "sakura") document.body.classList.add("sakura-mode");
    localStorage.setItem("theme", theme);
    themeBtn.innerText = themeIcons[theme];
}

themeBtn.onclick = () => {
    const current = localStorage.getItem("theme") || "dark";
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    applyTheme(next);
};

applyTheme(localStorage.getItem("theme") || "dark");

const zoomBtn = document.createElement("button");
zoomBtn.className = "zoom-btn";
zoomBtn.style.cssText = "position:relative;top:auto;right:auto;box-shadow:none;";
zoomBtn.style.display = specialButtonsVisible ? "block" : "none";
zoomBtn.innerText = "🔍";
zoomBtn.onclick = () => {
    let currentVal = pageZooms[currentPage] || 1.0;
    currentVal = currentVal >= 2.6 ? 0.8 : parseFloat((currentVal + 0.2).toFixed(1));
    pageZooms[currentPage] = currentVal;
    save();
    applyZoom();
};

// ✅ ลบปุ่ม cloudBtn ออก - ไม่มีฟังก์ชัน sync/restore อีกต่อไป

function makeDrawer() {
    const drawer = document.createElement("div");
    drawer.className = "settings-drawer hidden";
    drawer.id = "settings-drawer";
    drawer.style.display = specialButtonsVisible ? "block" : "none";
    return drawer;
}

// ปุ่มเหล่านี้ลบแล้ว (เกี่ยวกับ 720 Day Tracker)

function getTally(value){
    if(value <= 0) return "";
    if(value < 5) return "|".repeat(value);
    if(value === 5) return `<div style="position:relative;font-size:22px;letter-spacing:2px;">||||<div style="position:absolute;top:50%;left:-2px;width:110%;height:3px;background:currentColor;transform:rotate(-20deg);"></div></div>`;
}

window.manualArchiveExpense = () => {
    if (myExpenses.length === 0) { alert("ไม่มีรายการให้บันทึก"); return; }
    if (confirm("สรุปยอดรายวันและย้ายเข้าประวัติหรือไม่? (รายการวันนี้จะถูกล้าง)")) {
        let tin = 0; let tout = 0;
        myExpenses.forEach(x => { if(x.type === "in") tin += x.amt; else tout += x.amt; });
        const balance = tin - tout; // ✅ คำนวณ balance
        myExpenseArchive.unshift({
            date: getToday(),
            totalIn: tin,
            totalOut: tout,
            balance: balance, // ✅ เพิ่ม balance field
            total: balance,  // 🔥 เพิ่ม total field สำหรับ calculateTotalSavings
            type: "in"  // สำหรับ calculateTotalSavings
        });
        myExpenses = [];
        save();
        updateAchievements(); // 🔥 เช็ค badge หลังบันทึก
        render();
    }
};

/* ===== TRACKER MODAL ===== */
function showTrackerModal() {
    // 720 Day Tracker ลบแล้ว → เปิด Saving Jars โดยตรง
    currentPage = "saving";
    render();
}

/* ===== MAIN RENDER ===== */
function getProfileCardHTML(displayName, displayImage, googleUser, userProfileData) {
    const imageHTML = displayImage ? `<img src="${displayImage}" style="width:100%; height:100%; object-fit:cover;">` : `<img src="icon512_rounded.png" style="width:100%; height:100%; object-fit:cover;">`;
    const statusText = googleUser ? '✅ Active • Google Sync' : '✅ Active • Local Profile';
    
    return `<div style="background: transparent; border: 0.5px solid var(--color-border-tertiary); border-radius: 16px; padding: 10px 12px; cursor: pointer; transition: all 0.2s; background: linear-gradient(135deg, rgba(102,126,234,0.05) 0%, rgba(118,75,162,0.05) 100%);">
        <div style="display: flex; align-items: center; gap: 10px; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                <div style="width: 56px; height: 56px; border-radius: 12px; background: linear-gradient(135deg, #ff6b9d 0%, #c06c84 100%); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: white; overflow: hidden;">${imageHTML}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; font-size: 14px; color: white; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName}</div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.6); white-space: nowrap;">${statusText}</div>
                </div>
            </div>
            <div style="background: linear-gradient(135deg, #ffd89b 0%, #ff9a56 100%); padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; color: white; flex-shrink: 0; white-space: nowrap;">9 badges</div>
        </div>
    </div>`;
}

function render() {
    resetDailyGoalsIfNeeded();
    //autoArchiveExpenseIfNeeded();  // 💰 เพิ่มการบันทึก expense อัตโนมัติ
    ensureCalendarViewIsWithin12Months(); // 📅 ตรวจสอบและรีเซ็ต calendar view เมื่อเข้าเดือนใหม่
    resetTrackerLockIfNeeded(); // 🔄 เพิ่มตรงนี้ให้เช็ครีเซ็ตตั้งแต่ต้น
    updateAchievements(); // เช็คและปลดล็อค badges
    app.innerHTML = "";
    settingsOpen = false;
    applyZoom();
    
    // 🔒 อัปเดตการแสดง/ซ่อนปุ่มพิเศษตามค่า specialButtonsVisible
    setTimeout(() => {
        toggleSpecialButtons();
    }, 50);

    if (currentPage === "home") {
        // 🗑️ ลบการใช้ totalExp และ EXP_PER_LEVEL - ระบบ EXP ถูกลบแล้ว

        const homeContainer = document.createElement("div");
        homeContainer.className = "home-container";

        const levelBox = document.createElement("div");
        
        
        // ดึง unlocked badges สำหรับแสดง
        const unlockedList = getUnlockedBadgesForDisplay();
        levelBox.style.cursor = "pointer"; 
        levelBox.onclick = () => { currentPage = "profile"; render(); };
        
        // ดึงข้อมูล profile
        const userProfileData = JSON.parse(localStorage.getItem("userProfile")) || {};
        const userProfileImage = localStorage.getItem("userProfileImage") || null;
        const googleUser = localStorage.getItem("googleUser") ? JSON.parse(localStorage.getItem("googleUser")) : null;
        const displayName = googleUser?.name || userProfileData.username || "Setup Profile";
        const displayImage = googleUser?.picture || userProfileImage;
        
        levelBox.innerHTML = getProfileCardHTML(displayName, displayImage, googleUser, userProfileData);
        homeContainer.appendChild(levelBox);
      // สร้าง Coach Section ใหม่ (ลบรูปโค้ชแล้ว)
const coachSection = document.createElement("div");
coachSection.className = "home-coach-card";

// ใส่กรอบคำพูดแบบสุ่ม
const quoteBox = document.createElement("div");
quoteBox.className = "home-quote-bubble";
const randomQuoteIdx = Math.floor(Math.random() * myQuotes.length);
quoteBox.innerHTML = `
    "${myQuotes[randomQuoteIdx]}"
`;
// --- วางโค้ดนี้แทรกเข้าไปตรงบรรทัดว่าง (บรรทัดที่ 350) ---
const coachVoice = new Audio("https://videotourl.com/audio/1778680846934-aae99bc1-dcc2-4fdf-9b46-c46ad438af4f.mp3");
quoteBox.style.cursor = "pointer";

quoteBox.onclick = () => {
    if (!coachVoice.paused) {
        coachVoice.pause();
        coachVoice.currentTime = 0; 
        quoteBox.style.borderColor = "#ff4d4d"; 
        setTimeout(() => { quoteBox.style.borderColor = "#f1c40f"; }, 200);
    } else {
        coachVoice.play().catch(e => console.log("Check link audio"));
        quoteBox.style.borderColor = "#2ecc71";
        setTimeout(() => { quoteBox.style.borderColor = "#f1c40f"; }, 200);
    }
    quoteBox.style.transform = "scale(0.95)";
    setTimeout(() => { quoteBox.style.transform = "scale(1)"; }, 100);
};
// -----------------------------------------------------
coachSection.appendChild(quoteBox);
homeContainer.appendChild(coachSection); // ใส่เข้าไปในหน้า Home แทนหัวข้อเดิม
        
        // สร้าง Badge Container ใหม่ (Horizontal Scrollable)
        if (unlockedList.length > 0) {
            const badgeContainer = document.createElement("div");
            badgeContainer.className = "home-badge-container"
            badgeContainer.style.cursor = "pointer"; 
            badgeContainer.onclick = () => { currentPage = "achievements"; render(); };
            
            const badgeLabel = document.createElement("div");
            badgeLabel.className = "badge-label";
            badgeLabel.innerText = "🏆 Achievement (" + unlockedList.length + ")";
            badgeContainer.appendChild(badgeLabel);
            
            const badgeScrollWrapper = document.createElement("div");
            badgeScrollWrapper.className = "badge-scroll-wrapper";
            
            unlockedList.forEach(badge => {
                const badgeEl = document.createElement("div");
                badgeEl.className = "home-badge-item";
                badgeEl.innerHTML = `
                    <div class="badge-emoji-box">${badge.emoji}</div>
                    <div class="badge-text-box">
                        <div class="badge-name">${badge.name}</div>
                        <div class="badge-desc">${badge.desc}</div>
                    </div>
                `;
                badgeEl.title = badge.name + ": " + badge.desc;
                badgeScrollWrapper.appendChild(badgeEl);
            });
            
            badgeContainer.appendChild(badgeScrollWrapper);
            homeContainer.appendChild(badgeContainer);
        }

        

        /*const dtContainer = document.createElement("div");
        dtContainer.className = "datetime-container";
        dtContainer.innerHTML = `<div id="home-time" class="home-time">00:00:00</div><div id="home-date" class="home-date">Loading...</div>`;
        homeContainer.appendChild(dtContainer);
*/
        /* --- [ลอจิก ลากวางเมนู] --- */
        // --- [เริ่มวางตรงนี้] ---
        
        // ส่วนที่ 1: สร้าง Dashboard Card (สรุปข้อมูล)
        const dbCard = document.createElement("div");
        dbCard.className = "dashboard-card-big";
        
        let totalDays = 0; data.forEach(v => totalDays += v);
        const today = getToday();
        const todayArchive = myExpenseArchive.find(a => a.date === today);

        let expenseOut = todayArchive
        ? (todayArchive.totalOut || 0)
        : myExpenses
        .filter(e => e.date === today && e.type === "out")
        .reduce((s, e) => s + (Number(e.amt || e.amount || 0)), 0);
        let goalsLeft = myDailyGoals.filter(g => !g.done).length;

        dbCard.style.cursor = "pointer";
dbCard.onclick = () => { currentPage = "summary"; render(); };
        const totalSavings = getTotalSavingsFromAllJars();
        dbCard.innerHTML = `
            <div class="db-big-row"><span class="db-big-label">💰 สะสมรวม:</span><span class="db-big-value">${totalSavings.toLocaleString()} ฿</span></div>
            <div class="db-big-row"><span class="db-big-label">💸 วันนี้จ่าย:</span><span class="db-big-value" style="color:#ff7675">-${expenseOut.toLocaleString()} ฿</span></div>
            <div class="db-big-row"><span class="db-big-label">🎯 งานค้าง:</span><span class="db-big-value" style="color:#fdcb6e">${goalsLeft} รายการ</span></div>
        `;
        homeContainer.appendChild(dbCard);

        // ส่วนที่ 2: สร้างเมนูแบบ Grid 2 คอลัมน์ + ระบบลากวางเดิม
        const menuWrapper = document.createElement("div");
        menuWrapper.className = "home-menu-grid"; 

        const menuDataMap = {
            tracker: "💰 Savings Tracker",
            saving: "💰 Saving Jars",
            routine: "⏰ Daily Routine",
            daily: "🎯 Daily Goals",
            pomodoro: "🍅 Pomodoro",
            expense: "💰 Expense",
            longterm: "🏆 Long-term",
            notes: "📝 My Notes.",
            tvm: "🧮 Calculator Tool"
        };

        menuOrder.forEach((id, index) => {
            const div = document.createElement("div");
            div.className = "menu-item";
            div.dataset.id = id;
            div.innerText = menuDataMap[id] || id;
            div.setAttribute("draggable", "true");

            // บังคับ 2 อันดับแรกให้ยาวเต็มหน้าจอ
            if (index < 2) div.classList.add("full-row");

            div.onclick = () => { 
                if(!div.classList.contains('dragging')){ 
                    // 🔴 TRACKER: แสดง POPUP เมนูแทนเข้าเลย
                    if(id === "tracker") {
                        showTrackerModal();
                    } else if (id === "tvm") {
                        
                        showCalcToolsModal();  
                    } else {
                        currentPage = id; 
                        render();
                    }
                } 
            };
            
            // ระบบลากสลับตำแหน่ง
            div.ondragstart = () => div.classList.add("dragging");
            div.ondragend = () => {
                div.classList.remove("dragging");
                menuOrder = [...menuWrapper.querySelectorAll(".menu-item")].map(i => i.dataset.id);
                save();
                render(); 
            };
            menuWrapper.appendChild(div);
        });

        // ระบบตรวจจับการลากแทรกใน Grid
        menuWrapper.ondragover = (e) => {
            e.preventDefault();
            const dragging = document.querySelector(".dragging");
            const siblings = [...menuWrapper.querySelectorAll(".menu-item:not(.dragging)")];
            let next = siblings.find(s => {
                const box = s.getBoundingClientRect();
                return e.clientY <= box.top + box.height / 2;
            });
            menuWrapper.insertBefore(dragging, next);
        };

        homeContainer.appendChild(menuWrapper);
        
        // --- [จบการวาง] ---

        const qDiv = document.createElement('div'); 
        qDiv.className = 'custom-quote';
        const randomIdx = Math.floor(Math.random() * myQuotes.length);
        qDiv.innerText = `“ ${myQuotes[randomIdx]} ”`;
        // homeContainer.appendChild(qDiv); // ลบแล้ว
        
        const drawer = makeDrawer();
drawer.appendChild(themeBtn);
drawer.appendChild(zoomBtn);

app.appendChild(settingsBtn);
app.appendChild(drawer);
app.appendChild(homeContainer);
        updateHomeClock();
    } 
    else if (currentPage === "routine") { renderRoutinePage(); }
    else if (currentPage === "saving") { renderSavingJarsPage(); }
    else if (currentPage === "saving_jar_detail") { renderJarDetailPage(); }
    else if (currentPage === "pomodoro") { renderPomoPage(); }
    else if (currentPage === "expense") { renderExpensePage(); }
    else if (currentPage === "tvm") { renderTVMPage(); }
    else if (currentPage === "daily" || currentPage === "longterm") { renderGoalsPage(currentPage); }
    else if (currentPage === "notes") { renderNotesPageNew(); }
    else if (currentPage === "achievements") { renderAchievementsPage(); }
    else if (currentPage === "summary") { renderSummaryPage(); }
    else if (currentPage === "settings") { renderSettingsPage(); }
    else if (currentPage === "profile") { 
        renderProfilePage(); 
    }
    // 🗑️ ลบหน้า shop - ไม่มีระบบ shop อีกต่อไป
    else if (currentPage === "savings") { 
        renderSavingsPage();
    }
    
    // ✅ เรียก renderFloatingNavbar() ในทุกหน้า
    renderFloatingNavbar();
}

/* ===== SAVING JARS SYSTEM ===== */

function savingJarsMilestones(goal) {
    const g = goal;
    return [
        { pct: 0.01, label: 'เริ่มต้น!',    color: '#a8e6cf', glow: 'rgba(168,230,207,0.4)',  badge: '🌱 เริ่มต้นแล้ว' },
        { pct: 0.10, label: '10%',           color: '#ffd3a5', glow: 'rgba(255,211,165,0.4)',  badge: '🟡 10% Bronze' },
        { pct: 0.25, label: '25%',           color: '#fbbf24', glow: 'rgba(251,191,36,0.45)',  badge: '🟠 25% Silver' },
        { pct: 0.50, label: '50%',           color: '#f97316', glow: 'rgba(249,115,22,0.5)',   badge: '🔴 50% Gold' },
        { pct: 0.75, label: '75%',           color: '#a855f7', glow: 'rgba(168,85,247,0.5)',   badge: '🟣 75% Platinum' },
        { pct: 0.90, label: '90%',           color: '#3b82f6', glow: 'rgba(59,130,246,0.55)',  badge: '🔵 90% Diamond' },
        { pct: 1.00, label: 'เต็มกระปุก!',  color: '#f472b6', glow: 'rgba(255,105,180,0.6)',  badge: '✨ Rainbow Master' },
    ];
}

function getCurrentJarMilestone(jar) {
    const pct = Math.min(jar.saved / jar.goal, 1);
    const milestones = savingJarsMilestones(jar.goal);
    let cur = null;
    for (const m of milestones) { if (pct >= m.pct) cur = m; }
    return cur;
}
function getNextJarMilestone(jar) {
    const pct = Math.min(jar.saved / jar.goal, 1);
    const milestones = savingJarsMilestones(jar.goal);
    for (const m of milestones) { if (pct < m.pct) return m; }
    return null;
}

function showCreateJarPopup(editJarId = null) {
    const existing = editJarId ? savingJars.find(j => j.id === editJarId) : null;
    const selectedEmoji = existing ? existing.emoji : '💰';
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;overflow-y:auto;`;
    overlay.innerHTML = `
        <div style="background:linear-gradient(145deg,#1a1a2e,#16213e);border:2px solid rgba(255,255,255,0.15);border-radius:28px;padding:32px 24px;width:100%;max-width:340px;box-shadow:0 20px 60px rgba(0,0,0,0.6);animation:jarPopIn 0.35s cubic-bezier(0.17,0.67,0.83,0.67);margin:auto;">
            <div style="text-align:center;margin-bottom:24px;">
                <div id="jar-emoji-display" style="font-size:52px;margin-bottom:8px;cursor:pointer;user-select:none;">${selectedEmoji}</div>
                <h2 style="margin:0;font-size:20px;color:white;">${existing ? 'แก้ไขกระปุก' : 'สร้างกระปุกใหม่'}</h2>
                <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.5);">ตั้งชื่อและเป้าหมายการออม</p>
            </div>
            <div style="margin-bottom:16px;">
                <label style="font-size:12px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;">เลือกอิโมจิ</label>
                <div id="jar-emoji-selector" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
                    ${JAR_EMOJI_OPTIONS.map((opt, idx) => `
                        <button class="jar-emoji-btn" data-emoji="${opt.emoji}" onclick="document.getElementById('jar-emoji-display').textContent='${opt.emoji}';document.querySelectorAll('.jar-emoji-btn').forEach(b=>b.style.borderColor='rgba(255,255,255,0.2)');this.style.borderColor='#a855f7';this.style.boxShadow='0 0 10px rgba(168,85,247,0.4)';" 
                            style="padding:12px;border-radius:12px;border:2px solid ${opt.emoji===selectedEmoji?'#a855f7':'rgba(255,255,255,0.2)'};background:rgba(255,255,255,0.05);font-size:24px;cursor:pointer;transition:0.2s;${opt.emoji===selectedEmoji?'box-shadow:0 0 10px rgba(168,85,247,0.4);':''}" title="${opt.label}">
                            ${opt.emoji}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <label style="font-size:12px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;">ชื่อกระปุก</label>
                <input id="jar-name-input" type="text" placeholder="เช่น ไปเที่ยวญี่ปุ่น, ซื้อ iPhone..." value="${existing ? existing.name : ''}"
                    style="width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;border:1.5px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;font-size:16px;outline:none;font-family:inherit;">
            </div>
            <div style="margin-bottom:24px;">
                <label style="font-size:12px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;">เป้าหมาย (บาท)</label>
                <input id="jar-goal-input" type="number" placeholder="เช่น 50000" value="${existing ? existing.goal : ''}"
                    style="width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;border:1.5px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;font-size:18px;font-weight:bold;outline:none;font-family:inherit;">
            </div>
            <div style="display:flex;gap:10px;">
                <button id="jar-cancel-btn" style="flex:1;padding:14px;border-radius:14px;border:1.5px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.6);font-size:15px;cursor:pointer;font-family:inherit;">ยกเลิก</button>
                <button id="jar-confirm-btn" style="flex:2;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,#f472b6,#a855f7);color:white;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit;box-shadow:0 4px 15px rgba(168,85,247,0.4);">
                    ${existing ? '💾 บันทึก' : '✨ สร้างกระปุก'}
                </button>
            </div>
        </div>
        <style>
        @keyframes jarPopIn { from{opacity:0;transform:scale(0.8) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }
        #jar-name-input:focus,#jar-goal-input:focus { border-color:rgba(168,85,247,0.8)!important; }
        .jar-emoji-btn:active { transform:scale(0.9); }
        </style>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#jar-cancel-btn').onclick = () => overlay.remove();
    overlay.querySelector('#jar-confirm-btn').onclick = () => {
        const name = overlay.querySelector('#jar-name-input').value.trim();
        const goal = parseFloat(overlay.querySelector('#jar-goal-input').value);
        const emoji = document.getElementById('jar-emoji-display').textContent;
        if (!name) { overlay.querySelector('#jar-name-input').style.borderColor = '#ff7675'; return; }
        if (!goal || goal <= 0) { overlay.querySelector('#jar-goal-input').style.borderColor = '#ff7675'; return; }
        if (existing) {
            existing.name = name;
            existing.goal = goal;
            existing.emoji = emoji;
        } else {
            const newJar = { id: Date.now().toString(), name, goal, saved: 0, history: [], emoji, createdAt: new Date().toLocaleDateString('th-TH'), image: null };
            savingJars.push(newJar);
            activeJarId = newJar.id;
        }
        save();
        updateAchievements(); // 🔥 เช็ค badge "first_jar"
        overlay.remove();
        if (existing) { renderSavingJarsPage(); }
        else { activeJarId = savingJars[savingJars.length-1].id; currentPage = 'saving_jar_detail'; render(); }
    };
}

function renderSavingJarsPage() {
    app.innerHTML = '';
    const bBtn = document.createElement('button'); bBtn.className = 'back-btn'; bBtn.innerText = '🏠';
    bBtn.onclick = () => { currentPage = 'home'; render(); };
    const drawer = makeDrawer(); drawer.appendChild(themeBtn); drawer.appendChild(zoomBtn); 
    app.appendChild(bBtn); app.appendChild(settingsBtn); app.appendChild(drawer);

    const container = document.createElement('div');
    container.className = 'goals-page';
    container.style.paddingTop = '80px';

    let html = `<h1 style="margin-top:0;">💰 Saving</h1>`;

    if (savingJars.length === 0) {
        html += `
        <div style="text-align:center;padding:40px 20px;opacity:0.6;">
            <div style="font-size:64px;margin-bottom:12px;">💰</div>
            <div style="font-size:16px;">ยังไม่มีกระปุกหมูเลย<br>สร้างกระปุกแรกของคุณเลย!</div>
        </div>`;
    } else {
        html += `<div style="width:100%;max-width:380px;">`;
        savingJars.forEach(jar => {
            const pct = Math.min(jar.saved / jar.goal, 1);
            const ms = getCurrentJarMilestone(jar);
            const glowColor = ms ? ms.glow : 'rgba(255,255,255,0.1)';
            const barColor = ms ? ms.color : '#555';
            html += `
            <div onclick="openJar('${jar.id}')" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);border-radius:22px;padding:18px 20px;margin-bottom:14px;cursor:pointer;transition:0.2s;box-shadow:0 4px 20px ${glowColor};">
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="font-size:40px;flex-shrink:0;">${jar.emoji || '💰'}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:bold;font-size:16px;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${jar.name}</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:2px;">฿${jar.saved.toLocaleString()} / ฿${jar.goal.toLocaleString()}</div>
                        <div style="margin-top:8px;height:7px;background:rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;">
                            <div style="height:100%;width:${(pct*100).toFixed(1)}%;background:${barColor};border-radius:10px;transition:0.5s;"></div>
                        </div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px;">${ms ? ms.badge : 'เริ่มออมเลย!'}</div>
                    </div>
                    <div style="font-size:18px;font-weight:bold;color:${barColor};">${(pct*100).toFixed(0)}%</div>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    container.innerHTML = html;

    const addBtn = document.createElement('button');
    addBtn.style.cssText = `width:90%;max-width:380px;padding:16px;border-radius:18px;border:none;background:linear-gradient(135deg,#f472b6,#a855f7);color:white;font-size:16px;font-weight:bold;cursor:pointer;margin-top:10px;box-shadow:0 6px 20px rgba(168,85,247,0.35);`;
    addBtn.innerHTML = '+ สร้างกระปุกใหม่';
    addBtn.onclick = () => showCreateJarPopup();
    container.appendChild(addBtn);
    app.appendChild(container);

    window.openJar = (id) => {
        activeJarId = id;
        currentPage = 'saving_jar_detail';
        render();
    };
}

function renderJarDetailPage() {
    const jar = savingJars.find(j => j.id === activeJarId);
    if (!jar) { currentPage = 'saving'; render(); return; }

    app.innerHTML = '';
    const bBtn = document.createElement('button'); bBtn.className = 'back-btn'; bBtn.innerText = '←';
    bBtn.onclick = () => { currentPage = 'saving'; render(); };
    const drawer = makeDrawer(); drawer.appendChild(themeBtn); drawer.appendChild(zoomBtn); 
    app.appendChild(bBtn); app.appendChild(settingsBtn); app.appendChild(drawer);

    const container = document.createElement('div');
    container.className = 'goals-page';
    container.style.cssText = 'padding-top:40px;padding-bottom:40px;';

    const pct = Math.min(jar.saved / jar.goal, 1);
    const ms = getCurrentJarMilestone(jar);
    const nextMs = getNextJarMilestone(jar);
    const glowColor = ms ? ms.glow : 'rgba(249,168,212,0.2)';
    const barColor = ms ? ms.color : '#fbbf24';

    // Canvas pig / Image display
    const pigWrap = document.createElement('div');
    pigWrap.style.cssText = `display:flex;justify-content:center;align-items:center;flex-direction:column;margin:0 0 8px;`;

    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = `font-size:20px;font-weight:bold;color:white;text-align:center;margin-bottom:6px;padding:0 12px;`;
    nameDiv.innerHTML = `<span style="font-size:28px;margin-right:8px;">${jar.emoji || '💰'}</span>${jar.name}`;
    pigWrap.appendChild(nameDiv);

    let canvas;
    if (jar.image) {
        // Show uploaded image
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = `position:relative;width:300px;height:240px;border-radius:20px;overflow:hidden;border:3px solid rgba(255,255,255,0.2);background:linear-gradient(135deg,rgba(100,200,255,0.1),rgba(168,85,247,0.1));box-shadow:0 8px 32px rgba(0,0,0,0.4);`;
        
        const img = document.createElement('img');
        img.src = jar.image;
        img.style.cssText = `width:100%;height:100%;object-fit:cover;`;
        imgContainer.appendChild(img);
        
        // Badge overlay
        const badge = document.createElement('div');
        badge.style.cssText = `position:absolute;top:8px;right:8px;background:rgba(34,197,94,0.9);color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:bold;`;
        badge.innerText = '✓ รูปหลัก';
        imgContainer.appendChild(badge);
        
        pigWrap.appendChild(imgContainer);
        
        // Remove image button
        const removeBtn = document.createElement('button');
        removeBtn.style.cssText = `margin-top:6px;padding:4px 10px;border-radius:8px;border:1px solid rgba(239,68,68,0.4);background:transparent;color:#ef4444;font-size:10px;font-weight:bold;cursor:pointer;font-family:inherit;`;
        removeBtn.innerHTML = '🗑️ เอารูปออก';
        removeBtn.onclick = () => {
            jar.image = null;
            save();
            currentPage = 'saving_jar_detail';
            render();
        };
        pigWrap.appendChild(removeBtn);
    } else {
        // Show canvas pig
        canvas = document.createElement('canvas');
        canvas.id = 'jar-pig-canvas';
        canvas.width = 300; canvas.height = 240;
        canvas.style.display = 'block';
        pigWrap.appendChild(canvas);
        
        // Add image button
        const addBtn = document.createElement('button');
        addBtn.style.cssText = `margin-top:6px;padding:4px 10px;border-radius:8px;border:1px solid rgba(34,197,94,0.4);background:transparent;color:#22c55e;font-size:10px;font-weight:bold;cursor:pointer;font-family:inherit;`;
        addBtn.innerHTML = '+ เพิ่มรูปภาพ';
        addBtn.onclick = () => {
            openJarImageUploader(jar.id);
        };
        pigWrap.appendChild(addBtn);
    }
    
    container.appendChild(pigWrap);

    // Badge
    if (ms) {
        const badge = document.createElement('div');
        badge.style.cssText = `text-align:center;margin:4px 0 10px;`;
        badge.innerHTML = `<span style="display:inline-block;padding:5px 16px;border-radius:20px;font-size:13px;font-weight:600;background:rgba(255,255,255,0.08);color:${barColor};border:1px solid ${barColor}40;">${ms.badge}</span>`;
        container.appendChild(badge);
    }

    // Total amount
    const totalDiv = document.createElement('div');
    totalDiv.style.cssText = `text-align:center;margin:2px auto 6px;width:80%;max-width:260px;`;
    totalDiv.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(251,191,36,0.15),rgba(168,85,247,0.1));border:1.5px solid rgba(251,191,36,0.4);border-radius:14px;padding:10px 12px;backdrop-filter:blur(10px);">
            <span style="font-size:11px;color:rgba(255,255,255,0.6);display:block;margin-bottom:2px;">💰 ยอดเงินรวม</span>
            <span style="font-size:28px;font-weight:900;color:#fbbf24;text-shadow:0 0 20px rgba(251,191,36,0.5);display:block;">฿${jar.saved.toLocaleString()}</span>
            <span style="font-size:10px;color:rgba(255,255,255,0.5);display:block;margin-top:4px;">เป้าหมาย ฿${jar.goal.toLocaleString()}</span>
        </div>
    `;
    container.appendChild(totalDiv);

    // Progress bar
    const progressWrap = document.createElement('div');
    progressWrap.style.cssText = `width:90%;max-width:340px;margin:0 auto 4px;`;
    const remaining = Math.max(0, jar.goal - jar.saved);  // คำนวณเงินที่ขาด
    progressWrap.innerHTML = `
        <div style="display:flex;justify-content:center;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:6px;">
            <span>${(pct*100).toFixed(1)}%</span>
        </div>
        <div style="height:12px;background:rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;border:0.5px solid rgba(255,255,255,0.1);">
            <div style="height:100%;width:${(pct*100).toFixed(1)}%;background:linear-gradient(90deg,#fbbf24,${barColor});border-radius:10px;transition:0.6s;box-shadow:0 0 10px ${glowColor};"></div>
        </div>
        ${remaining > 0 ? `<div style="font-size:13px;color:#60a5fa;text-align:center;margin-top:8px;font-weight:600;">ขาดอีก ฿${remaining.toLocaleString()}</div>` : `<div style="font-size:11px;color:#f472b6;text-align:center;margin-top:4px;">🎉 เต็มกระปุกแล้ว!</div>`}
    `;
    container.appendChild(progressWrap);

    // Deposit section
    const depositCard = document.createElement('div');
    depositCard.style.cssText = `width:90%;max-width:340px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:18px;margin:14px auto 0;`;
    depositCard.innerHTML = `
        <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);margin-bottom:12px;">💰 เลือกจำนวนที่จะฝาก</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px;" id="jar-btn-row">
            <button onclick="jarSelectAmt(10)" data-amt="10" style="padding:8px 2px;border-radius:10px;border:2px solid #22c55e;background:rgba(34,197,94,0.1);color:#22c55e;font-size:15px;font-weight:900;cursor:pointer;transition:0.15s;font-family:inherit;line-height:1.1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;"><span style="font-size:11px;opacity:0.8;">+</span><span>10</span></button>
            <button onclick="jarSelectAmt(50)" data-amt="50" style="padding:8px 2px;border-radius:10px;border:2px solid #eab308;background:rgba(234,179,8,0.1);color:#eab308;font-size:15px;font-weight:900;cursor:pointer;transition:0.15s;font-family:inherit;line-height:1.1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;"><span style="font-size:11px;opacity:0.8;">+</span><span>50</span></button>
            <button onclick="jarSelectAmt(100)" data-amt="100" style="padding:8px 2px;border-radius:10px;border:2px solid #ef4444;background:rgba(239,68,68,0.1);color:#ef4444;font-size:14px;font-weight:900;cursor:pointer;transition:0.15s;font-family:inherit;line-height:1.1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;"><span style="font-size:10px;opacity:0.8;">+</span><span>100</span></button>
            <button onclick="jarSelectAmt(500)" data-amt="500" style="padding:8px 2px;border-radius:10px;border:2px solid #a855f7;background:rgba(168,85,247,0.1);color:#a855f7;font-size:14px;font-weight:900;cursor:pointer;transition:0.15s;font-family:inherit;line-height:1.1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;"><span style="font-size:11px;opacity:0.8;">+</span><span>500</span></button>
            <button onclick="jarSelectAmt(1000)" data-amt="1000" style="padding:8px 2px;border-radius:10px;border:2px solid #6b7280;background:rgba(107,114,128,0.1);color:#9ca3af;font-size:12px;font-weight:900;cursor:pointer;transition:0.15s;font-family:inherit;line-height:1.1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;"><span style="font-size:9px;opacity:0.8;">+</span><span>1K</span></button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
            <input id="jar-custom-input" type="number" placeholder="หรือกรอกจำนวนเอง..." 
                style="flex:1;padding:12px 14px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:white;font-size:15px;outline:none;font-family:inherit;">
            <button onclick="jarSelectCustom()" style="padding:12px 16px;border-radius:12px;border:none;background:rgba(255,255,255,0.15);color:white;font-size:13px;cursor:pointer;font-family:inherit;white-space:nowrap;">เลือก</button>
        </div>
        <div id="jar-pending-bar" style="display:none;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);border-radius:12px;padding:10px 14px;align-items:center;gap:8px;">
            <span id="jar-pending-txt" style="flex:1;font-size:14px;color:#fbbf24;font-weight:600;"></span>
            <button onclick="jarConfirmDeposit()" style="padding:7px 14px;border-radius:8px;border:none;background:#22c55e;color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">✅ ยืนยัน</button>
            <button onclick="jarCancelDeposit()" style="padding:7px 14px;border-radius:8px;border:none;background:#f87171;color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">❌ ยกเลิก</button>
        </div>
    `;
    container.appendChild(depositCard);

    // History section
    const histCard = document.createElement('div');
    histCard.style.cssText = `width:90%;max-width:340px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:18px;margin:14px auto 0;`;
    const recentHistory = (jar.history || []).slice(0, 14);
    const grouped = {};
    recentHistory.forEach(h => {
        if (!grouped[h.date]) grouped[h.date] = 0;
        grouped[h.date] += h.amount;
    });
    let histHTML = `<div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.5);margin-bottom:12px;">📋 ประวัติ 7 วัน</div>`;
    const entries = Object.entries(grouped).slice(0, 7);
    if (entries.length === 0) {
        histHTML += `<div style="text-align:center;color:rgba(255,255,255,0.3);font-size:13px;padding:10px 0;">ยังไม่มีประวัติการออม</div>`;
    } else {
        entries.forEach(([date, amt]) => {
            histHTML += `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,0.06);font-size:13px;">
                <span style="color:rgba(255,255,255,0.5);">${date}</span>
                <span style="font-weight:700;color:#22c55e;">+฿${amt.toLocaleString()}</span>
            </div>`;
        });
    }
    histCard.innerHTML = histHTML;
    container.appendChild(histCard);

    // Action buttons
    const actionRow = document.createElement('div');
    actionRow.style.cssText = `width:90%;max-width:340px;margin:14px auto 0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;`;
    actionRow.innerHTML = `
        <button onclick="showCreateJarPopup('${jar.id}')" style="padding:12px 8px;border-radius:14px;border:1.5px solid rgba(255,255,255,0.2);background:transparent;color:white;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">✏️ แก้ไข</button>
        <button onclick="resetJar('${jar.id}')" style="padding:12px 8px;border-radius:14px;border:1.5px solid rgba(249,115,22,0.4);background:transparent;color:#f97316;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">🔄 รีเซ็ท</button>
        <button onclick="deleteJar('${jar.id}')" style="padding:12px 8px;border-radius:14px;border:1.5px solid rgba(239,68,68,0.4);background:transparent;color:#ef4444;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">🗑️ ลบ</button>
    `;
    container.appendChild(actionRow);

    app.appendChild(container);

    // Draw pig canvas only if no image
    if (canvas && !jar.image) {
        drawJarPig(canvas, pct, ms, jar.saved);
    }

    // Expose functions
    window.jarSelectAmt = (amt) => {
        jarPendingDeposit = amt;
        const colorMap = { 10: '#22c55e', 50: '#eab308', 100: '#ef4444', 500: '#a855f7', 1000: '#6b7280' };
        const bgColorMap = { 10: 'rgba(34,197,94,0.2)', 50: 'rgba(234,179,8,0.2)', 100: 'rgba(239,68,68,0.2)', 500: 'rgba(168,85,247,0.2)', 1000: 'rgba(107,114,128,0.2)' };
        document.querySelectorAll('#jar-btn-row button').forEach(b => {
            if (b.dataset.amt == amt) {
                b.style.background = bgColorMap[amt];
                b.style.borderColor = colorMap[amt];
            } else {
                b.style.background = 'rgba(255,255,255,0.05)';
                b.style.borderColor = 'rgba(255,255,255,0.15)';
            }
        });
        const pb = document.getElementById('jar-pending-bar');
        if (pb) { pb.style.display = 'flex'; document.getElementById('jar-pending-txt').innerText = `ฝาก +฿${amt.toLocaleString()} บาท?`; }
    };
    window.jarSelectCustom = () => {
        const val = parseFloat(document.getElementById('jar-custom-input').value);
        if (!val || val <= 0) { document.getElementById('jar-custom-input').style.borderColor='#ff7675'; return; }
        jarPendingDeposit = val;
        document.getElementById('jar-custom-input').style.borderColor='rgba(255,255,255,0.15)';
        const pb = document.getElementById('jar-pending-bar');
        if (pb) { pb.style.display = 'flex'; document.getElementById('jar-pending-txt').innerText = `ฝาก +฿${val.toLocaleString()} บาท?`; }
    };
    window.jarCancelDeposit = () => {
        jarPendingDeposit = 0;
        const pb = document.getElementById('jar-pending-bar');
        if (pb) pb.style.display = 'none';
        document.querySelectorAll('#jar-btn-row button').forEach(b => {
            b.style.background = 'rgba(255,255,255,0.05)';
            b.style.borderColor = 'rgba(255,255,255,0.15)';
        });
    };
    window.jarConfirmDeposit = () => {
        if (!jarPendingDeposit || jarPendingDeposit <= 0) return;
        const j = savingJars.find(x => x.id === activeJarId);
        if (!j) return;
        const prevMs = getCurrentJarMilestone(j);
        j.saved = Math.min(j.saved + jarPendingDeposit, j.goal);
        const today = new Date().toLocaleDateString('th-TH', { day:'numeric', month:'short' });
        if (!j.history) j.history = [];
        j.history.unshift({ date: today, amount: jarPendingDeposit, ts: Date.now() });
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        j.history = j.history.filter(h => h.ts >= cutoff).slice(0, 50);
        const depositAmount = jarPendingDeposit;
        jarPendingDeposit = 0;
        // 🗑️ ลบ addExp - ระบบ EXP ถูกลบแล้ว
        save();
        updateAchievements(); // 🔥 เช็ค badge saving jars
        const newMs = getCurrentJarMilestone(j);
        if (newMs && (!prevMs || newMs.label !== prevMs.label)) {
            showMilestonePopup(j, newMs);
        } else {
            currentPage = 'saving_jar_detail';
            render();
        }
    };
    window.resetJar = (id) => {
        if (!confirm('🔄 รีเซ็ทยอดออมในกระปุกนี้?\nประวัติและเงินออมทั้งหมดจะถูกลบ')) return;
        if (!confirm('❗ ยืนยันอีกครั้ง: รีเซ็ทกระปุก "' + jar.name + '" แน่ใจไหม?')) return;
        const j = savingJars.find(x => x.id === id);
        if (j) { j.saved = 0; j.history = []; }
        save(); render();
    };
    window.deleteJar = (id) => {
        if (!confirm('🗑️ ลบกระปุก "' + jar.name + '" ทิ้งทั้งหมด?')) return;
        savingJars = savingJars.filter(j => j.id !== id);
        if (activeJarId === id) activeJarId = savingJars.length > 0 ? savingJars[0].id : null;
        save(); currentPage = 'saving'; render();
    };
}

function cropImageFromBase64(base64Image, coords) {
    const img = new Image();
    const canvas = document.createElement('canvas');
    
    // รองรับทั้ง square crop (size) และ rectangular crop (width, height)
    const cropWidth = coords.width || coords.size || 300;
    const cropHeight = coords.height || coords.size || 300;
    
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    // Return canvas data URL
    return new Promise((resolve) => {
        img.onload = () => {
            // crop และ resize เป็น 300x300
            ctx.drawImage(
                img,
                coords.x, coords.y, cropWidth, cropHeight,  // source
                0, 0, 300, 300  // destination (เสมอ 300x300)
            );
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = base64Image;
    });
}

/* ===== JAR IMAGE UPLOAD & CROP ===== */
function openJarImageUploader(jarId) {
    // ✅ ใช้วิธีเดียวกับหน้า My Profile
    // ใช้ input type="file" + accept="image/*" ให้มือถือเปิด Photo Picker / Gallery
    const fileInput = document.createElement('input');

    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = false;

    // ซ่อนไว้ ไม่ให้โผล่ในหน้า
    fileInput.style.position = 'fixed';
    fileInput.style.left = '-9999px';
    fileInput.style.opacity = '0';

    document.body.appendChild(fileInput);

    fileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];

        // ลบ input ทิ้งหลังเลือกเสร็จ
        fileInput.remove();

        if (!file) return;

        // ✅ กันพลาด เลือกได้เฉพาะรูปภาพ
        if (!file.type || !file.type.startsWith('image/')) {
            showNotification(
                "⚠️ ไฟล์ไม่ถูกต้อง",
                "กรุณาเลือกรูปภาพเท่านั้น",
                "error"
            );
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
            // ✅ ใช้ cropper เดิมของกระปุก
            showImageCropper(jarId, event.target.result);
        };

        reader.readAsDataURL(file);
    };

    fileInput.click();
}

function showImageCropper(jarId, imageSrc) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px;`;
    
    const jar = savingJars.find(j => j.id === jarId);
    if (!jar) return;
    
    let cropCoords = { x: 0, y: 0, size: 0 }; // เก็บพิกัด crop
    
    overlay.innerHTML = `
        <div style="background:#1a1a2e;border-radius:24px;padding:24px;width:100%;max-width:420px;box-shadow:0 10px 60px rgba(0,0,0,0.7);">
            <h2 style="margin:0 0 16px;color:white;font-size:18px;font-weight:bold;">🖼️ เลือกพื้นที่รูปภาพ</h2>
            <p style="margin:0 0 16px;color:rgba(255,255,255,0.6);font-size:13px;">ลากเพื่อเลือกพื้นที่ที่ต้องการ (ขนาดจะเป็นสี่เหลี่ยมจัตุรัส 300x300px)</p>
            
            <div style="position:relative;width:100%;max-width:380px;margin:0 auto 16px;border:2px solid rgba(255,255,255,0.2);border-radius:16px;overflow:hidden;background:black;">
                <img id="cropImage" src="${imageSrc}" style="width:100%;height:auto;display:block;cursor:crosshair;">
                <canvas id="cropCanvas" style="position:absolute;top:0;left:0;cursor:crosshair;"></canvas>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                <button onclick="cancelImageUpload()" style="padding:12px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.2);background:transparent;color:white;font-size:14px;font-weight:bold;cursor:pointer;font-family:inherit;">❌ ยกเลิก</button>
                <button onclick="confirmImageUploadWithCrop('${jarId}')" style="padding:12px;border-radius:12px;border:none;background:#22c55e;color:white;font-size:14px;font-weight:bold;cursor:pointer;font-family:inherit;">✅ ใช้รูปนี้</button>
            </div>
            
            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.6;">
                💡 <strong>คำแนะนำ:</strong> เลือกพื้นที่ที่มีเนื้อหาหลัก เพื่อให้เห็นชัดเมื่อปรากฏในกระปุก
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    const img = overlay.querySelector('#cropImage');
    const canvas = overlay.querySelector('#cropCanvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
        const rect = img.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        let isSelecting = false;
        let startX, startY, endX, endY;
        
        function drawSelection() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (isSelecting && startX !== undefined) {
                const x = Math.min(startX, endX);
                const y = Math.min(startY, endY);
                const size = Math.min(Math.abs(endX - startX), Math.abs(endY - startY));
                
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.clearRect(x, y, size, size);
                
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.strokeRect(x, y, size, size);
                ctx.setLineDash([]);
                
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(x, y, size, size);
                
                // เก็บพิกัด crop (ปรับให้เป็นสัดส่วน original image)
                const scale = img.naturalWidth / canvas.width;
                cropCoords = {
                    x: Math.floor(x * scale),
                    y: Math.floor(y * scale),
                    size: Math.floor(size * scale)
                };
            }
        }
        
        canvas.addEventListener('mousedown', (e) => {
            isSelecting = true;
            const rect = canvas.getBoundingClientRect();
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            endX = startX;
            endY = startY;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!isSelecting) return;
            const rect = canvas.getBoundingClientRect();
            endX = e.clientX - rect.left;
            endY = e.clientY - rect.top;
            drawSelection();
        });
        
        canvas.addEventListener('mouseup', () => {
            isSelecting = false;
        });
        
        canvas.addEventListener('touchstart', (e) => {
            isSelecting = true;
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            startX = touch.clientX - rect.left;
            startY = touch.clientY - rect.top;
            endX = startX;
            endY = startY;
        });
        
        canvas.addEventListener('touchmove', (e) => {
            if (!isSelecting) return;
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            endX = touch.clientX - rect.left;
            endY = touch.clientY - rect.top;
            drawSelection();
        });
        
        canvas.addEventListener('touchend', () => {
            isSelecting = false;
        });
    };
    
    window.cancelImageUpload = () => {
        overlay.remove();
    };
    
    window.confirmImageUploadWithCrop = async (jarId) => {
        const jar = savingJars.find(j => j.id === jarId);
        if (!jar) return;
        
        // ถ้าไม่ได้ลาก crop ให้ใช้ center crop แทน
        if (cropCoords.size === 0) {
            const img = overlay.querySelector('#cropImage');
            const size = Math.min(img.naturalWidth, img.naturalHeight);
            cropCoords = {
                x: Math.floor((img.naturalWidth - size) / 2),
                y: Math.floor((img.naturalHeight - size) / 2),
                size: size
            };
        }
        
        // Crop image ตัวจริง
        const croppedImage = await cropImageFromBase64(imageSrc, cropCoords);
        jar.image = croppedImage;
        save();
        overlay.remove();
        currentPage = 'saving_jar_detail';
        render();
    };
}

function showMilestonePopup(jar, ms) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10001;`;
    overlay.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid ${ms.color};border-radius:30px;padding:40px 30px;text-align:center;width:90%;max-width:320px;box-shadow:0 0 40px ${ms.glow},0 20px 60px rgba(0,0,0,0.5);animation:jarPopIn 0.4s cubic-bezier(0.17,0.67,0.83,0.67);">
            <div style="font-size:64px;margin-bottom:8px;animation:celebShake 0.3s ease-in-out infinite;">🎉</div>
            <h2 style="margin:0 0 8px;color:${ms.color};font-size:22px;">${ms.badge}</h2>
            <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0 0 24px;">กระปุก "${jar.name}"<br>ถึง Milestone แล้ว!</p>
            <button onclick="this.closest('div').parentElement.remove();currentPage='saving_jar_detail';render();" style="width:100%;padding:14px;border-radius:14px;border:none;background:${ms.color};color:black;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit;">ยอดเยี่ยม! ✨</button>
        </div>
    `;
    triggerConfetti();
    document.body.appendChild(overlay);
}

function drawJarPig(canvas, fillRatio, ms, savedAmount) {
    const ctx = canvas.getContext('2d');
    const W = 300, H = 240;
    let coins = [];
    let animRunning = true;
    const coinRadius = 5;

    function draw() {
        if (!animRunning || !canvas.isConnected) { animRunning = false; return; }
        ctx.clearRect(0, 0, W, H);

        // === TREASURE CHEST (GLASS) ===
        // Wood frame border
        ctx.save();
        ctx.strokeStyle = '#6B4423';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.roundRect(40, 50, 220, 150, 10);
        ctx.stroke();
        ctx.restore();

        // Glass panel - semi-transparent blue
        ctx.save();
        const glassGrad = ctx.createLinearGradient(40, 50, 260, 200);
        glassGrad.addColorStop(0, 'rgba(224, 247, 255, 0.2)');
        glassGrad.addColorStop(0.5, 'rgba(179, 229, 252, 0.12)');
        glassGrad.addColorStop(1, 'rgba(144, 202, 249, 0.18)');
        ctx.fillStyle = glassGrad;
        ctx.beginPath();
        ctx.roundRect(48, 58, 204, 134, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Chest lid (curved glass top)
        ctx.save();
        ctx.fillStyle = glassGrad;
        ctx.beginPath();
        ctx.moveTo(40, 50);
        ctx.quadraticCurveTo(150, 15, 260, 50);
        ctx.lineTo(260, 70);
        ctx.quadraticCurveTo(150, 40, 40, 70);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Lid shine effect
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(85, 25);
        ctx.quadraticCurveTo(150, 18, 215, 30);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Gold bottom frame
        ctx.save();
        ctx.fillStyle = '#black';
        ctx.beginPath();
        ctx.roundRect(40, 188, 220, 12, 4);
        ctx.fill();
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();

        // Gold corner brackets
        const corners = [[40,50],[260,50],[40,188],[260,188]];
        corners.forEach(([x,y]) => {
            ctx.save();
            ctx.fillStyle = '#FFD54F';
            ctx.fillRect(x-8, y-8, 16, 16);
            ctx.strokeStyle = '#D4AF37';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x-8, y-8, 16, 16);
            ctx.restore();
        });

        // Lid lock
        ctx.save();
        ctx.strokeStyle = '#FFD54F';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(142, 72, 16, 14);
        ctx.stroke();
        ctx.fillStyle = '#FFD54F';
        ctx.beginPath();
        ctx.arc(150, 85, 2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // === COINS INSIDE (same size circles) ===
        if (fillRatio > 0) {
            ctx.save();
            // Clipping to glass area
            ctx.beginPath();
            ctx.roundRect(48, 58, 204, 134, 8);
            ctx.clip();

            const coinSpacing = coinRadius * 2 + 2.5;
            const coinsPerRow = Math.floor(204 / coinSpacing);
            const maxRows = Math.max(1, Math.ceil(fillRatio * 8));
            const baseY = 185;

            for (let row = 0; row < maxRows; row++) {
                const rowY = baseY - row * coinSpacing;
                if (rowY < 65) break;

                // Slight horizontal offset for each row (alternating)
                const xOffset = row % 2 === 0 ? 0 : coinSpacing / 2;
                const startX = 48 + xOffset + coinRadius + 3;
                
                for (let col = 0; col < coinsPerRow; col++) {
                    const x = startX + col * coinSpacing;
                    if (x + coinRadius > 252) break;
                    
                    const jitter = Math.sin(row * 3 + col * 1.7) * 0.8;
                    
                    // Coin circle
                    ctx.beginPath();
                    ctx.arc(x + jitter, rowY, coinRadius, 0, Math.PI*2);
                    ctx.fillStyle = '#FFD54F';
                    ctx.fill();
                    ctx.strokeStyle = '#FBC02D';
                    ctx.lineWidth = 0.7;
                    ctx.stroke();

                    // Coin shine/highlight
                    ctx.beginPath();
                    ctx.arc(x + jitter - 1.5, rowY - 1.5, 1.5, 0, Math.PI*2);
                    ctx.fillStyle = 'rgba(255,255,255,0.6)';
                    ctx.fill();
                }
            }

            ctx.restore();
        }

        // Glass shine/reflection overlay
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(48, 58, 204, 134, 8);
        ctx.clip();
        
        const shineGrad = ctx.createLinearGradient(50, 60, 180, 140);
        shineGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
        shineGrad.addColorStop(0.3, 'rgba(255,255,255,0.05)');
        shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shineGrad;
        ctx.fillRect(40, 50, 230, 160);
        
        ctx.restore();

        // === FALLING COINS ANIMATION ===
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            c.y += c.vy;
            c.vy += 1.2;
            c.rot += 0.16;
            c.life -= 1;
            
            if (c.life <= 0 || c.y > 195) { 
                coins.splice(i, 1); 
                continue; 
            }
            
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(c.rot);
            
            // Coin 3D effect with rotation
            const sx = Math.abs(Math.cos(c.rot * 2)) * 0.6 + 0.4;
            ctx.scale(sx, 1);
            ctx.globalAlpha = Math.min(1, c.life / 15);
            
            // Coin circle
            ctx.beginPath();
            ctx.arc(0, 0, coinRadius + 1, 0, Math.PI*2);
            const cg = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, coinRadius + 1);
            cg.addColorStop(0, '#FFED4E');
            cg.addColorStop(0.7, '#FFD54F');
            cg.addColorStop(1, '#F9A825');
            ctx.fillStyle = cg;
            ctx.fill();
            
            // Coin edge
            ctx.strokeStyle = '#FBC02D';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            
            // Coin shine
            ctx.beginPath();
            ctx.arc(-1, -1, 1.5, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fill();
            
            ctx.restore();
        }

        // Completion celebration
        if (fillRatio >= 1) {
            const t = Date.now() * 0.004;
            ctx.save();
            ctx.globalAlpha = 0.6 + 0.2 * Math.sin(t);
            
            // Sparkle effect around chest
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2 + t;
                const x = 150 + 120 * Math.cos(angle);
                const y = 120 + 80 * Math.sin(angle);
                ctx.fillStyle = `hsl(${(i * 45 + t * 100) % 360}, 100%, 60%)`;
                ctx.beginPath();
                ctx.arc(x, y, 3 + 2 * Math.sin(t + i), 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        }

        requestAnimationFrame(draw);
    }
    draw();

    // Expose spawn for deposit - spawn coins based on amount
    canvas._spawnCoins = (amount) => {
        // More coins = more money
        const count = Math.min(Math.ceil(Math.log2(amount + 1) * 3), 25);
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const randomX = 110 + Math.random() * 80;
                coins.push({ 
                    x: randomX, 
                    y: 40 + Math.random() * 20, 
                    vy: 0.3 + Math.random() * 1.5, 
                    rot: Math.random() * Math.PI * 2, 
                    life: 35 + Math.random() * 20 
                });
            }, i * 60);
        }
    };

    // Stop animation when canvas is removed
    const obs = new MutationObserver(() => { 
        if (!canvas.isConnected) { 
            animRunning = false; 
            obs.disconnect(); 
        } 
    });
    obs.observe(document.body, { childList: true, subtree: true });
}

/* ===== END SAVING JARS SYSTEM ===== */

/* === ฟังก์ชันย่อย Routine === */
function renderRoutinePage() {
    const bBtn = document.createElement("button"); bBtn.className = "back-btn"; bBtn.innerText = "🏠";
    bBtn.onclick = () => { settingsOpen = false; currentPage = "home"; render(); };
    const drawer = makeDrawer();
drawer.appendChild(themeBtn);
drawer.appendChild(zoomBtn);

app.appendChild(bBtn);
app.appendChild(settingsBtn);
app.appendChild(drawer);

    const title = document.createElement("h1"); title.innerText = "Daily Routine"; app.appendChild(title);
    
    const container = document.createElement("div"); container.className = "goals-page";
    
    const addBox = document.createElement("div"); addBox.className = "add-box";
    addBox.innerHTML = `
        <input type="time" id="rt-time" style="padding:15px; border-radius:12px; border:1px solid #ccc;">
        <input type="text" id="rt-task" placeholder="กิจกรรม..." style="margin-top:5px;">
        <button onclick="addRoutine()" style="margin-top:10px;">＋ เพิ่มเข้าตาราง</button>
    `;
    container.appendChild(addBox);

    const listDiv = document.createElement("div"); listDiv.style.width = "100%"; listDiv.style.maxWidth = "350px";
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    myRoutines.sort((a, b) => {
        const [hA, mA] = a.time.split(":").map(Number);
        const [hB, mB] = b.time.split(":").map(Number);
        return (hA * 60 + mA) - (hB * 60 + mB);
    });

    myRoutines.forEach((r, i) => {
        const [h, m] = r.time.split(":").map(Number);
        const taskMinutes = h * 60 + m;
        const isCurrent = (currentMinutes >= taskMinutes && (i === myRoutines.length - 1 || currentMinutes < (parseInt(myRoutines[i+1].time.split(":")[0])*60 + parseInt(myRoutines[i+1].time.split(":")[1]))));

        const item = document.createElement("div");
        item.className = "goal-item";
        if(isCurrent) {
            item.style.border = "3px solid #00b894";
            item.style.background = "rgba(0, 184, 148, 0.1)";
        }
        item.innerHTML = `
            <b style="color:#00b894; min-width:60px;">${r.time}</b>
            <span style="flex:1; margin-left:15px;">${r.task}</span>
            <span class="del-btn" onclick="delRoutine(${i})">🗑️</span>
        `;
        listDiv.appendChild(item);
    });

    container.appendChild(listDiv);
    app.appendChild(container);
}

window.addRoutine = () => {
    const time = document.getElementById("rt-time").value;
    const task = document.getElementById("rt-task").value;
    if(time && task) {
        myRoutines.push({ time, task });
        save(); render();
    }
};

window.delRoutine = (i) => {
    if(confirm("ลบ?")) {
        myRoutines.splice(i, 1);
        save(); render();
    }
};

/* ===== POMODORO LOGIC ===== */
function renderPomoPage() {
    const bBtn = document.createElement("button"); bBtn.className = "back-btn"; bBtn.innerText = "🏠";
    bBtn.onclick = () => { clearInterval(pomoInterval); isPomoRunning = false; settingsOpen = false; currentPage = "home"; render(); };
    const drawer = makeDrawer();
drawer.appendChild(themeBtn);
drawer.appendChild(zoomBtn);

app.appendChild(bBtn);
app.appendChild(settingsBtn);
app.appendChild(drawer);
    const title = document.createElement("h1"); title.innerText = "Pomodoro Timer"; app.appendChild(title);
    const container = document.createElement("div"); container.className = "goals-page";
    container.innerHTML = `
        <div class="pomo-card">
            <div id="pomo-status" class="pomo-status-label status-focus">FOCUS TIME 🎯</div>
            <div id="pomo-display" class="pomo-timer-display">25:00</div>
            <div class="pomo-btns">
                <button class="btn-start" onclick="startPomo()">START</button>
                <button class="btn-stop" onclick="stopPomo()">STOP</button>
                <button class="btn-reset" onclick="resetPomo()">RESET</button>
            </div>
            <div class="pomo-setup-group">
                <div class="pomo-input-box"><label>Focus</label><input type="number" id="in-focus" value="25"></div>
                <div class="pomo-input-box"><label>พักสั้น</label><input type="number" id="in-short" value="5"></div>
                <div class="pomo-input-box"><label>พักยาว</label><input type="number" id="in-long" value="15"></div>
            </div>
            <button onclick="applyPomoSettings()" style="margin-top:10px; padding:12px; border-radius:12px; border:none; background:#00b894; color:white; font-weight:bold; cursor:pointer; width:100%;">Update & Reset</button>
        </div>
    `;
    app.appendChild(container); updatePomoDisplay(); updatePomoStatusUI();
}
window.applyPomoSettings = () => { stopPomo(); pomoMode = "focus"; pomoTime = (parseInt(document.getElementById('in-focus').value) || 25) * 60; updatePomoDisplay(); updatePomoStatusUI(); };
window.startPomo = () => {
    if(isPomoRunning) return;
    clearInterval(pomoInterval); // ล้าง interval เก่าก่อนเสมอ ป้องกัน interval ซ้อนกัน
    pomoAlarm.play().then(() => { pomoAlarm.pause(); pomoAlarm.currentTime = 0; }).catch(e => console.log("Audio waiting for user"));
    isPomoRunning = true;
    pomoInterval = setInterval(() => { pomoTime--; updatePomoDisplay(); if(pomoTime <= 0) handlePomoFlow(); }, 1000);
};
function handlePomoFlow() {
    pomoAlarm.play().catch(e => console.log("Audio play error", e));
    if (pomoMode === "focus") {
        const count = parseInt(localStorage.getItem("pomoCount") || "0");
        localStorage.setItem("pomoCount", count + 1);
        // บันทึกเวลา Focus จริงที่ใช้ไป (นาที) แทนการ hardcode × 25
        const focusMinutesUsed = parseInt(document.getElementById('in-focus').value) || 25;
        const totalFocusMinutes = parseInt(localStorage.getItem("pomoFocusMinutes") || "0");
        localStorage.setItem("pomoFocusMinutes", totalFocusMinutes + focusMinutesUsed);
    }
    if (pomoMode === "focus") { pomoMode = "short"; pomoTime = (parseInt(document.getElementById('in-short').value) || 5) * 60; }
    else { pomoMode = "focus"; pomoTime = (parseInt(document.getElementById('in-focus').value) || 25) * 60; }
    updatePomoStatusUI(); updatePomoDisplay();
}
function updatePomoStatusUI() {
    const el = document.getElementById('pomo-status'); if(!el) return;
    if (pomoMode === "focus") { el.innerText = "FOCUS TIME 🎯"; el.className = "pomo-status-label status-focus"; }
    else { el.innerText = "BREAK TIME 🥛"; el.className = "pomo-status-label status-break"; }
}
window.stopPomo = () => { clearInterval(pomoInterval); isPomoRunning = false; };
window.resetPomo = () => { stopPomo(); applyPomoSettings(); };
function updatePomoDisplay() { const el = document.getElementById('pomo-display'); if(!el) return; const m = Math.floor(pomoTime / 60); const s = pomoTime % 60; el.innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; }

function getPomoSettings() {
    const saved = JSON.parse(localStorage.getItem("pomoSettings") || "null");
    const base = saved || pomoSettings || DEFAULT_POMO_SETTINGS;
    return {
        focus: Math.max(1, parseInt(base.focus) || DEFAULT_POMO_SETTINGS.focus),
        short: Math.max(1, parseInt(base.short) || DEFAULT_POMO_SETTINGS.short),
        long: Math.max(1, parseInt(base.long) || DEFAULT_POMO_SETTINGS.long)
    };
}

function readPomoSettingsFromInputs() {
    return {
        focus: Math.max(1, parseInt(document.getElementById("in-focus")?.value) || DEFAULT_POMO_SETTINGS.focus),
        short: Math.max(1, parseInt(document.getElementById("in-short")?.value) || DEFAULT_POMO_SETTINGS.short),
        long: Math.max(1, parseInt(document.getElementById("in-long")?.value) || DEFAULT_POMO_SETTINGS.long)
    };
}

function savePomoSettings() {
    localStorage.setItem("pomoSettings", JSON.stringify(pomoSettings));
}

function renderPomoPage() {
    pomoSettings = getPomoSettings();

    const bBtn = document.createElement("button");
    bBtn.className = "back-btn";
    bBtn.innerText = "🏠";
    bBtn.onclick = () => {
        stopPomo();
        settingsOpen = false;
        currentPage = "home";
        render();
    };

    const drawer = makeDrawer();
    drawer.appendChild(themeBtn);
    drawer.appendChild(zoomBtn);

    app.appendChild(bBtn);
    app.appendChild(settingsBtn);
    app.appendChild(drawer);

    const title = document.createElement("h1");
    title.innerText = "Pomodoro Timer";
    app.appendChild(title);

    const container = document.createElement("div");
    container.className = "goals-page";
    container.innerHTML = `
        <div class="pomo-card" id="pomodoro-card">
            <div id="pomo-status" class="pomo-status-label status-focus">FOCUS TIME 🎯</div>
            <div id="pomo-display" class="pomo-timer-display">25:00</div>
            <div class="pomo-btns">
                <button class="btn-start" onclick="startPomo()">START</button>
                <button class="btn-stop" onclick="stopPomo()">STOP</button>
                <button class="btn-reset" onclick="resetPomo()">RESET</button>
            </div>
            <div class="pomo-setup-group">
                <div class="pomo-input-box"><label>Focus</label><input type="number" id="in-focus" min="1" max="180" value="${pomoSettings.focus}"></div>
                <div class="pomo-input-box"><label>พักสั้น</label><input type="number" id="in-short" min="1" max="60" value="${pomoSettings.short}"></div>
                <div class="pomo-input-box"><label>พักยาว</label><input type="number" id="in-long" min="1" max="120" value="${pomoSettings.long}"></div>
            </div>
            <button onclick="applyPomoSettings()" style="margin-top:10px; padding:12px; border-radius:12px; border:none; background:#00b894; color:white; font-weight:bold; cursor:pointer; width:100%;">Update & Reset</button>
        </div>
    `;
    app.appendChild(container);
    updatePomoDisplay();
    updatePomoStatusUI();
}

window.applyPomoSettings = () => {
    stopPomo();
    pomoSettings = readPomoSettingsFromInputs();
    savePomoSettings();
    pomoMode = "focus";
    pomoTime = pomoSettings.focus * 60;
    pomoCompletedFocusInCycle = 0;
    localStorage.setItem("pomoCompletedFocusInCycle", "0");
    updatePomoDisplay();
    updatePomoStatusUI();
};

window.startPomo = async () => {
    if (isPomoRunning) return;
    const canNotify = await ensurePomoNotificationPermission();
    clearInterval(pomoInterval);
    const previousFocusSeconds = getPomoSettings().focus * 60;
    pomoSettings = readPomoSettingsFromInputs();
    savePomoSettings();
    if (pomoMode === "focus" && pomoTime === previousFocusSeconds) {
        pomoTime = pomoSettings.focus * 60;
    }
    pomoAlarm.play().then(() => {
        pomoAlarm.pause();
        pomoAlarm.currentTime = 0;
    }).catch(e => console.log("Audio waiting for user"));
    isPomoRunning = true;
    pomoEndAt = Date.now() + (pomoTime * 1000);
    pomoInterval = setInterval(tickPomo, 250);
    if (canNotify) showPomoLocalNotification("Pomodoro เริ่มแล้ว", getPomoNotificationBody());
};

function tickPomo() {
    if (!isPomoRunning || !pomoEndAt) return;
    pomoTime = Math.max(0, Math.ceil((pomoEndAt - Date.now()) / 1000));
    updatePomoDisplay();
    if (pomoTime <= 0) handlePomoFlow();
}

function handlePomoFlow() {
    pomoAlarm.play().catch(e => console.log("Audio play error", e));

    if (pomoMode === "focus") {
        const count = parseInt(localStorage.getItem("pomoCount") || "0");
        localStorage.setItem("pomoCount", count + 1);

        const totalFocusMinutes = parseInt(localStorage.getItem("pomoFocusMinutes") || "0");
        localStorage.setItem("pomoFocusMinutes", totalFocusMinutes + pomoSettings.focus);

        pomoCompletedFocusInCycle = (pomoCompletedFocusInCycle + 1) % 4;
        localStorage.setItem("pomoCompletedFocusInCycle", String(pomoCompletedFocusInCycle));
        updateAchievements();

        const shouldTakeLongBreak = pomoCompletedFocusInCycle === 0;
        pomoMode = shouldTakeLongBreak ? "long" : "short";
        pomoTime = (shouldTakeLongBreak ? pomoSettings.long : pomoSettings.short) * 60;
    } else {
        pomoMode = "focus";
        pomoTime = pomoSettings.focus * 60;
    }

    if (isPomoRunning) pomoEndAt = Date.now() + (pomoTime * 1000);
    updatePomoStatusUI();
    updatePomoDisplay();
    showPomoLocalNotification(getPomoNotificationTitle(), getPomoNotificationBody());
}

function updatePomoStatusUI() {
    const el = document.getElementById("pomo-status");
    if (!el) return;
    if (pomoMode === "focus") {
        el.innerText = "FOCUS TIME 🎯";
        el.className = "pomo-status-label status-focus";
    } else if (pomoMode === "long") {
        el.innerText = "LONG BREAK 🥛";
        el.className = "pomo-status-label status-break";
    } else {
        el.innerText = "BREAK TIME 🥛";
        el.className = "pomo-status-label status-break";
    }
}

window.stopPomo = () => {
    if (pomoEndAt) {
        pomoTime = Math.max(0, Math.ceil((pomoEndAt - Date.now()) / 1000));
        updatePomoDisplay();
    }
    clearInterval(pomoInterval);
    isPomoRunning = false;
    pomoEndAt = null;
};

window.resetPomo = () => {
    stopPomo();
    pomoMode = "focus";
    pomoSettings = getPomoSettings();
    pomoTime = pomoSettings.focus * 60;
    updatePomoDisplay();
    updatePomoStatusUI();
};

async function ensurePomoNotificationPermission() {
    if (!("Notification" in window)) {
        showNotification("แจ้งเตือนไม่รองรับ", "เบราว์เซอร์นี้ยังไม่รองรับ Notification", "error");
        return false;
    }

    if (Notification.permission === "granted") return true;

    if (Notification.permission === "denied") {
        showNotification("เปิดแจ้งเตือนไม่ได้", "กรุณาอนุญาต Notification จากการตั้งค่าเบราว์เซอร์ก่อน", "error");
        return false;
    }

    if (typeof requestNotificationPermission === "function") {
        await requestNotificationPermission();
    } else {
        await Notification.requestPermission();
    }

    const granted = Notification.permission === "granted";
    if (!granted) {
        showNotification("Pomodoro เริ่มได้", "ยังไม่ได้เปิด Notification ระบบจะจับเวลาต่อในหน้าแอป", "info");
    }
    return granted;
}

function getPomoNotificationTitle() {
    if (pomoMode === "focus") return "ถึงเวลา Focus";
    if (pomoMode === "long") return "พักยาวได้แล้ว";
    return "พักสั้นได้แล้ว";
}

function getPomoNotificationBody() {
    const minutes = Math.ceil(pomoTime / 60);
    if (pomoMode === "focus") return `กำลังอยู่ในโหมด Focus เหลือประมาณ ${minutes} นาที`;
    if (pomoMode === "long") return `พักยาว ${minutes} นาที แล้วค่อยกลับมา Focus`;
    return `พักสั้น ${minutes} นาที แล้วค่อยกลับมา Focus`;
}

async function showPomoLocalNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const options = {
        body,
        icon: "./icon512_rounded.png",
        badge: "./icon512_rounded.png",
        tag: "pomodoro-status",
        renotify: true,
        requireInteraction: false,
        data: {
            page: "pomodoro",
            mode: pomoMode
        }
    };

    try {
        if ("serviceWorker" in navigator) {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(title, options);
            return;
        }
        new Notification(title, options);
    } catch (error) {
        console.warn("Pomodoro notification failed:", error);
    }
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden && isPomoRunning) {
        showPomoLocalNotification("Pomodoro ยังทำงานอยู่", getPomoNotificationBody());
    }
});

/* ===== EXPENSE MODAL - SIMPLIFIED VERSION ===== */
window.showAddExpenseModal = (type) => {
    const categories = type === 'in' ? myIncomeCategories : myExpenseCategories;
    const categoryColor = type === 'in' ? '#00b894' : '#ff7675';
    const defaultEmoji = type === 'in' ? '💰' : '💸';
    
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 24px;
        max-width: 380px;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        animation: slideUp 0.3s ease-out;
    `;
    
    let modalHTML = `
        <h3 style="margin: 0 0 20px; color: white; text-align: center; font-size: 18px; font-weight: bold;">
            ${type === 'in' ? '📥 บันทึกรายรับ' : '📤 บันทึกรายจ่าย'}
        </h3>
        
        <label style="color: rgba(255,255,255,0.8); font-size: 12px; font-weight: 600; display: block; margin-bottom: 8px;">รายการ</label>
        <input type="text" id="expense-name" placeholder="พิมชื่อรายการ เช่น กาแฟ" 
            style="
                width: 100%;
                padding: 12px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 8px;
                color: white;
                font-size: 14px;
                margin-bottom: 16px;
                box-sizing: border-box;
            "
        >
        
        <label style="color: rgba(255,255,255,0.8); font-size: 12px; font-weight: 600; display: block; margin-bottom: 8px;">จำนวนเงิน</label>
        <input type="number" id="expense-amount" placeholder="0" 
            style="
                width: 100%;
                padding: 12px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 8px;
                color: white;
                font-size: 14px;
                margin-bottom: 20px;
                box-sizing: border-box;
            "
        >
        
        <label style="color: rgba(255,255,255,0.8); font-size: 12px; font-weight: 600; display: block; margin-bottom: 10px;">📋 รายการแนะนำ (กดเพื่อใส่ชื่อและ emoji)</label>
        <div id="category-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; max-height: 280px; overflow-y: auto;">
    `;
    
    categories.forEach(cat => {
        modalHTML += `
            <button onclick="window.selectCategoryFromModal('${cat.name}', '${cat.emoji}')" 
                style="
                    padding: 10px 6px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    font-size: 11px;
                    transition: all 0.2s;
                    font-weight: 600;
                "
                onmouseover="this.style.background='rgba(${type === 'in' ? '0,184,148' : '255,118,117'},0.15)'; this.style.borderColor='${categoryColor}';"
                onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(255,255,255,0.1)';"
            >
                <span style="font-size: 20px;">${cat.emoji}</span>
                <span>${cat.name}</span>
            </button>
        `;
    });
    
    modalHTML += `
        </div>
        
        <button onclick="window.showCustomCategoryModal('${type}')" 
            style="
                width: 100%;
                padding: 10px;
                background: rgba(200,200,200,0.2);
                border: 1px dashed rgba(255,255,255,0.3);
                border-radius: 8px;
                color: rgba(255,255,255,0.7);
                cursor: pointer;
                font-weight: 600;
                margin-bottom: 16px;
                transition: all 0.2s;
                font-size: 13px;
            "
            onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='white';"
            onmouseout="this.style.background='rgba(200,200,200,0.2)'; this.style.color='rgba(255,255,255,0.7)';"
        >
            ➕ เพิ่มรายการใหม่
        </button>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button onclick="window.closeExpenseModal();" 
                style="
                    padding: 10px;
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s;
                    font-size: 14px;
                "
                onmouseover="this.style.background='rgba(255,255,255,0.15)';"
                onmouseout="this.style.background='rgba(255,255,255,0.1)';"
            >
                ยกเลิก
            </button>
            <button onclick="window.finishAddExpense('${type}')" 
                style="
                    padding: 10px;
                    background: ${categoryColor};
                    border: none;
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s;
                    font-size: 14px;
                "
                onmouseover="this.style.opacity='0.9';"
                onmouseout="this.style.opacity='1';"
            >
                บันทึก
            </button>
        </div>
    `;
    
    modal.innerHTML = modalHTML;
    modal.setAttribute("data-expense-modal", "true");
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            window.closeExpenseModal();
        }
    };
};

window.selectCategoryFromModal = (name, emoji) => {
    const nameInput = document.querySelector("#expense-name");
    if (nameInput) {
        nameInput.value = name;
        nameInput.dataset.emoji = emoji;
    }
    
    // Focus on amount input
    setTimeout(() => {
        const amountInput = document.querySelector("#expense-amount");
        if (amountInput) amountInput.focus();
    }, 50);
};

window.closeExpenseModal = () => {
    const modal = document.querySelector("[data-expense-modal]");
    if (modal) {
        modal.parentNode.remove();
    }
};

window.finishAddExpense = (type) => {
    const nameInput = document.querySelector("#expense-name");
    const amountInput = document.querySelector("#expense-amount");
    
    const name = nameInput?.value?.trim();
    const amount = parseFloat(amountInput?.value);
    const emoji = nameInput?.dataset?.emoji || (type === 'in' ? '💰' : '💸');
    
    if (!name) {
        alert("กรุณาพิมชื่อรายการ");
        return;
    }
    
    if (!amount || amount <= 0) {
        alert("กรุณาใส่จำนวนเงิน");
        return;
    }
    
    // Add expense
    myExpenses.unshift({
        note: name,
        amt: amount,
        type: type,
        time: new Date().toLocaleTimeString('th-TH'),
        date: getToday(),
        emoji: emoji
    });
    
    // Auto-archive
    let tin = 0, tout = 0;
    myExpenses.forEach(x => { if(x.type === "in") tin += x.amt; else tout += x.amt; });
    
    const today = getToday();
    const existingIndex = myExpenseArchive.findIndex(a => a.date === today);
    const balance = tin - tout;
    
    if (existingIndex >= 0) {
        myExpenseArchive[existingIndex] = {
            date: today,
            totalIn: tin,
            totalOut: tout,
            balance: balance,
            total: balance,
            type: "in",
            items: [...myExpenses]
        };
    } else {
        myExpenseArchive.unshift({
            date: today,
            totalIn: tin,
            totalOut: tout,
            balance: balance,
            total: balance,
            type: "in",
            items: [...myExpenses]
        });
    }
    
    save();
window.closeExpenseModal();
currentPage = "expense";
render();
};

window.showCustomCategoryModal = (type) => {
    // Close existing modal first
    window.closeExpenseModal();
    
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 24px;
        max-width: 380px;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        animation: slideUp 0.3s ease-out;
    `;
    
    modal.innerHTML = `
        <h3 style="margin: 0 0 20px; color: white; font-size: 18px; font-weight: bold;">➕ เพิ่มรายการใหม่</h3>
        
        <label style="color: rgba(255,255,255,0.8); font-size: 13px; font-weight: 600; display: block; margin-bottom: 8px;">ชื่อรายการ</label>
        <input type="text" id="custom-name" placeholder="เช่น ค่าเที่ยว" 
            style="
                width: 100%;
                padding: 12px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 8px;
                color: white;
                font-size: 14px;
                margin-bottom: 16px;
                box-sizing: border-box;
            "
        >
        
        <label style="color: rgba(255,255,255,0.8); font-size: 13px; font-weight: 600; display: block; margin-bottom: 8px;">เลือก Emoji</label>
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 16px; max-height: 280px; overflow-y: auto;">
    `;
    
    const emojiList = [
        // 💰 เงิน/การเงิน
        '💰', '💵', '💴', '💶', '💷', '💸', '💳', '🏦', '💎', '🪙',
        // 😀 ความสุข/อารมณ์
        '😀', '😊', '😄', '😂', '🤗', '💯', '👍', '❤️', '🔥', '✨',
        // 🏃 กิจกรรม
        '🏃', '🚴', '🏊', '🧘', '🎮', '🎨', '🎭', '🎬', '🎤', '🎸', '📚',
        // 🍕 อาหาร
        '🍕', '🍔', '🍟', '🍗', '🌮', '🌯', '🍝', '🍜', '🍲', '🥗', '🍱', '🍛', '🍰', '🍦',
        // 🚗 เดินทาง
        '🚗', '🚕', '🚙', '🚌', '🚎', '🏍️', '🛴', '🚲', '✈️', '🚁', '🚂', '🚆', '🚊', '🚇',
        // 📱 สิ่งของ
        '📱', '💻', '⌚', '🎧', '👜', '👝', '🧳', '📷', '📹', '⚽', '🎾', '🎯', '🎁',
        // 🐶 สัตว์
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮',
        // 🌟 อื่นๆ
        '🌟', '⭐', '🌙', '☀️', '🌈', '🎊', '🎉', '🔔', '📖', '✏️', '⚡', '🌺', '🌸', '🌼'
    ];
    
    emojiList.forEach(emoji => {
        modal.innerHTML += `
            <button onclick="window.selectCustomEmoji('${emoji}')" 
                style="
                    padding: 8px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    font-size: 18px;
                    cursor: pointer;
                    transition: all 0.2s;
                "
                onmouseover="this.style.background='rgba(255,255,255,0.15)'; this.style.transform='scale(1.15)';"
                onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.transform='scale(1)';"
            >
                ${emoji}
            </button>
        `;
    });
    
    modal.innerHTML += `
        </div>
        
        <div id="selected-emoji-display" style="text-align: center; font-size: 32px; margin-bottom: 16px; color: rgba(255,255,255,0.5);">-</div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button onclick="document.querySelector('[data-custom-modal]').parentNode.remove(); window.showAddExpenseModal('${type}');" 
                style="
                    padding: 10px;
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s;
                    font-size: 14px;
                "
                onmouseover="this.style.background='rgba(255,255,255,0.15)';"
                onmouseout="this.style.background='rgba(255,255,255,0.1)';"
            >
                ยกเลิก
            </button>
            <button onclick="window.saveCustomCategory('${type}')" 
                style="
                    padding: 10px;
                    background: #22c55e;
                    border: none;
                    border-radius: 8px;
                    color: white;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s;
                    font-size: 14px;
                "
                onmouseover="this.style.opacity='0.9';"
                onmouseout="this.style.opacity='1';"
            >
                บันทึก
            </button>
        </div>
    `;
    
    modal.setAttribute("data-custom-modal", "true");
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
            window.showAddExpenseModal(type);
        }
    };
};

window.selectCustomEmoji = (emoji) => {
    window.selectedCustomEmoji = emoji;
    const display = document.querySelector("#selected-emoji-display");
    if (display) {
        display.innerHTML = emoji;
        display.style.color = "white";
    }
};

window.saveCustomCategory = (type) => {
    const name = document.querySelector("#custom-name").value.trim();
    const emoji = window.selectedCustomEmoji || '🎯';
    
    if (!name) {
        alert("กรุณาใส่ชื่อรายการ");
        return;
    }
    
    const newCategory = {
        id: `custom_${Date.now()}`,
        name: name,
        emoji: emoji
    };
    
    if (type === 'in') {
        myIncomeCategories.push(newCategory);
        localStorage.setItem("my_income_categories", JSON.stringify(myIncomeCategories));
    } else {
        myExpenseCategories.push(newCategory);
        localStorage.setItem("my_expense_categories", JSON.stringify(myExpenseCategories));
    }
    
    // Close custom modal and go back to add expense modal
    const customModal = document.querySelector("[data-custom-modal]");
    if (customModal) {
        customModal.parentNode.remove();
    }
    
    // Reopen the add expense modal with the new category visible
    window.showAddExpenseModal(type);
};

/* ===== EXPENSE & ARCHIVE LOGIC ===== */
function renderExpensePage() {
    const bBtn = document.createElement("button"); bBtn.className = "back-btn"; bBtn.innerText = "🏠";
    bBtn.onclick = () => { settingsOpen = false; currentPage = "home"; render(); };
    const drawer = makeDrawer();
drawer.appendChild(themeBtn);
drawer.appendChild(zoomBtn);

app.appendChild(bBtn);
app.appendChild(settingsBtn);
app.appendChild(drawer);
    let totalIn = 0; let totalOut = 0;
    myExpenses.forEach(x => { if(x.type === "in") totalIn += x.amt; else totalOut += x.amt; });
    const container = document.createElement("div"); container.className = "goals-page";
    container.innerHTML = `
        <h1>Daily Expense</h1>
        <div class="expense-card">
            <div class="expense-summary">
                <div class="summary-box income-box"><small>วันนี้รับ</small><br>+${totalIn.toLocaleString()}</div>
                <div class="summary-box out-box"><small>วันนี้จ่าย</small><br>-${totalOut.toLocaleString()}</div>
                <div class="summary-box balance-box">${(totalIn - totalOut).toLocaleString()}</div>
            </div>
            <div class="add-box" style="width:100%; max-width:none;">
                <div style="display:flex; gap:10px;">
                    <button onclick="window.showAddExpenseModal('in')" style="flex:1; background:#00b894; padding:14px; border:none; border-radius:10px; color:white; font-weight:bold; cursor:pointer; font-size:16px; transition:all 0.2s;">＋ รับ</button>
                    <button onclick="window.showAddExpenseModal('out')" style="flex:1; background:#ff7675; padding:14px; border:none; border-radius:10px; color:white; font-weight:bold; cursor:pointer; font-size:16px; transition:all 0.2s;">－ จ่าย</button>
                </div>
            </div>
        </div>
        <div style="width:100%; max-width:380px;">
            <h3 style="margin-left:10px;text-align:left;">รายการวันนี้</h3>
            <div id="expense-list"></div>
        </div>
            
        <div style="width:100%; margin-top: 25px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h2 style="margin: 0; font-size: 18px;">📅 รายเดือน</h2>
                <button id="month-selector-btn" onclick="showMonthSelector()" style="padding: 8px 16px; background: linear-gradient(135deg, #f0ad4e 0%, #ec971f 100%); border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: 600; font-size: 12px;">เลือกเดือน</button>
            </div>
            
            <div id="calendar-summary" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;"></div>
            
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; font-size: 11px; font-weight: bold; text-align: center; margin-bottom: 8px;">
                <div style="color: rgba(255,255,255,0.6);">อา.</div>
                <div style="color: rgba(255,255,255,0.6);">จ.</div>
                <div style="color: rgba(255,255,255,0.6);">อ.</div>
                <div style="color: rgba(255,255,255,0.6);">พ.</div>
                <div style="color: rgba(255,255,255,0.6);">พฤ.</div>
                <div style="color: rgba(255,255,255,0.6);">ศ.</div>
                <div style="color: rgba(255,255,255,0.6);">ส.</div>
            </div>
            
            <div id="calendar-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;"></div>
        </div>
    `;
    app.appendChild(container);
    const listDiv = document.getElementById("expense-list");
    myExpenses.forEach((x, i) => {
        const item = document.createElement("div");
        item.className = `expense-item ${x.type === 'in' ? 'ex-type-in' : 'ex-type-out'}`;
        const emoji = x.emoji || '📝';
        item.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">${emoji}</span>
            <div>
                <div style="font-weight:bold;">${x.note}</div>
                <div class="ex-date">${x.time}</div>
            </div>
        </div>
            <div class="ex-amt" style="color:${x.type === 'in' ? '#00b894' : '#ff7675'}">${x.type === 'in' ? '+' : '-'}${x.amt.toLocaleString()}
            <span style="margin-left:10px; cursor:pointer; opacity:0.3;" onclick="delExpense(${i})">🗑️</span></div>`;
        listDiv.appendChild(item);
    });
    
    // 📅 CALENDAR RENDERING
    // Get calendar days
    const calDays = generateCalendarDays(calendarViewYear, calendarViewMonth);
    
    // Populate summary
    const monthlyData = getMonthlyTotals(calendarViewYear, calendarViewMonth);
    const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const summaryDiv = document.getElementById("calendar-summary");
    summaryDiv.innerHTML = `
        <div style="background: rgba(255,107,107,0.2); padding: 10px; border-radius: 8px; text-align: center;">
            <small style="color: rgba(255,255,255,0.6);">รายจ่ายรวม</small><br>
            <strong style="color: #ff7675; font-size: 16px;">-${monthlyData.out.toLocaleString()}</strong>
        </div>
        <div style="background: rgba(0,184,148,0.2); padding: 10px; border-radius: 8px; text-align: center;">
            <small style="color: rgba(255,255,255,0.6);">รายรับรวม</small><br>
            <strong style="color: #00b894; font-size: 16px;">+${monthlyData.in.toLocaleString()}</strong>
        </div>
        <div style="background: rgba(100,200,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
            <small style="color: rgba(255,255,255,0.6);">คงเหลือ</small><br>
            <strong style="color: #64c8ff; font-size: 16px;">${monthlyData.balance.toLocaleString()}</strong>
        </div>
    `;
    
    // Populate calendar grid
    const gridDiv = document.getElementById("calendar-grid");
    gridDiv.innerHTML = ''; // Clear first
    calDays.forEach(day => {
        const cell = document.createElement("div");
        cell.style.cssText = `
            aspect-ratio: 1;
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 6px;
            padding: 4px 2px;
            font-size: 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            background: rgba(255,255,255,0.03);
            min-height: 0;
        `;
        
        if (!day.date) {
            cell.style.opacity = '0.15';
            cell.style.background = 'transparent';
        } else {
            const expense = getExpenseForDate(calendarViewYear, calendarViewMonth, day.date);
            cell.innerHTML = `
                <strong style="font-size: 12px; line-height: 1; margin-bottom: 2px;">${day.date}</strong>
                <span style="color: #ff7675; font-size: 9px; line-height: 1;">${expense.out > 0 ? `-${expense.out}` : '0'}</span>
                <span style="color: #00b894; font-size: 9px; line-height: 1;">${expense.in > 0 ? `+${expense.in}` : '0'}</span>
            `;
            // Make clickable
            cell.style.cursor = 'pointer';
            cell.onclick = () => showExpenseDetailModal(calendarViewYear, calendarViewMonth, day.date);
        }
        gridDiv.appendChild(cell);
    });
    
    // 🔄 อัพเดทปุ่ม "เลือกเดือน" ให้แสดงเดือนปัจจุบัน
    const monthSelectorBtn = document.getElementById("month-selector-btn");
    if (monthSelectorBtn) {
        monthSelectorBtn.textContent = `${monthNames[calendarViewMonth]} ${calendarViewYear + 543}`;
    }
}
window.addExpense = (type) => {
    const note = document.getElementById("ex-note").value; 
    const amt = parseFloat(document.getElementById("ex-amt").value);
    if(note && amt) { 
        // Add to today's list
        myExpenses.unshift({ note: note, amt: amt, type: type, time: new Date().toLocaleTimeString('th-TH'), date: getToday() }); 
        
        // Auto-archive immediately
        let tin = 0; let tout = 0;
        myExpenses.forEach(x => { if(x.type === "in") tin += x.amt; else tout += x.amt; });
        
        // Update or create today's archive
        const today = getToday();
        const existingIndex = myExpenseArchive.findIndex(a => a.date === today);
        const balance = tin - tout;
        
        if (existingIndex >= 0) {
            // Update existing entry
            myExpenseArchive[existingIndex] = {
                date: today,
                totalIn: tin,
                totalOut: tout,
                balance: balance,
                total: balance,
                type: "in",
                items: [...myExpenses] // 📝 Store itemized list
            };
        } else {
            // Create new entry
            myExpenseArchive.unshift({
                date: today,
                totalIn: tin,
                totalOut: tout,
                balance: balance,
                total: balance,
                type: "in",
                items: [...myExpenses] // 📝 Store itemized list
            });
        }
        
        save(); 
        
        // Clear input
        document.getElementById("ex-note").value = '';
        document.getElementById("ex-amt").value = '';
        
        render(); 
    }
};
window.delExpense = (i) => { 
    showDeleteExpenseModal(myExpenses[i], i);
};

/* ===== DELETE EXPENSE MODAL ===== */
function showDeleteExpenseModal(expense, index) {
    // สร้าง overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    // สร้าง modal
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 32px 24px;
        max-width: 300px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease-out;
    `;
    
    // เพิ่ม animation ถ้าไม่มี
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    if (!document.querySelector("style[data-modal-anim]")) {
        style.setAttribute("data-modal-anim", "true");
        document.head.appendChild(style);
    }
    
    const typeEmoji = expense.type === "in" ? "💚" : "💔";
    const typeText = expense.type === "in" ? "รับ" : "จ่าย";
    const sign = expense.type === "in" ? "+" : "-";
    
    modal.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: white;">ลบรายการ?</h3>
            <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.6); font-size: 13px;">คุณแน่ใจว่าต้องการลบ "<span style="font-weight: 600; color: rgba(255, 255, 255, 0.8);">${expense.note}</span>" (${typeEmoji} ${sign}${expense.amt.toLocaleString()}) หรือไม่</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="cancel-delete-exp" style="flex: 1; padding: 12px 20px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">ยกเลิก</button>
                <button id="confirm-delete-exp" style="flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%); border: none; border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);">ลบ</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Event listeners
    document.getElementById("cancel-delete-exp").onclick = () => {
        overlay.remove();
    };
    
    document.getElementById("confirm-delete-exp").onclick = () => {
        myExpenses.splice(index, 1); 
        
        // Re-archive immediately after delete
        let tin = 0; let tout = 0;
        myExpenses.forEach(x => { if(x.type === "in") tin += x.amt; else tout += x.amt; });
        
        const today = getToday();
        const existingIndex = myExpenseArchive.findIndex(a => a.date === today);
        const balance = tin - tout;
        
        if (existingIndex >= 0) {
            myExpenseArchive[existingIndex] = {
                date: today,
                totalIn: tin,
                totalOut: tout,
                balance: balance,
                total: balance,
                type: "in",
                items: [...myExpenses]
            };
        }
        
        save(); 
        overlay.remove();
        render();
        showNotification("✅ ลบสำเร็จ", `"${expense.note}" ถูกลบออก`, "success");
    };
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

/* ===== EXPENSE DETAIL POPUP ===== */
function showExpenseDetailModal(year, month, day) {
    // Find expenses for this date from myExpenseArchive
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const archiveEntry = myExpenseArchive.find(a => a.date === dateStr);
    
    if (!archiveEntry) {
        showNotification("ไม่มีข้อมูล", `ไม่มีข้อมูลสำหรับวันที่ ${day}`, "info");
        return;
    }
    
    const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    
    // Create overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    // Create modal
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 24px;
        max-width: 350px;
        width: 90%;
        max-height: 70vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease-out;
    `;
    
    // Build items list HTML
    let itemsHTML = '';
    if (archiveEntry.items && archiveEntry.items.length > 0) {
        itemsHTML = `
            <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0; padding-top: 16px;">
                <h4 style="margin: 0 0 12px; color: rgba(255,255,255,0.8); font-size: 13px;">📋 รายการบันทึก:</h4>
                <div style="max-height: 200px; overflow-y: auto;">
        `;
        archiveEntry.items.forEach((item) => {
            const color = item.type === 'in' ? '#00b894' : '#ff7675';
            const sign = item.type === 'in' ? '+' : '-';
            itemsHTML += `
                <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid ${color};">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: white; font-size: 13px; flex: 1;">${item.note}</span>
                        <span style="color: ${color}; font-weight: 600; font-size: 12px;">${sign}${item.amt.toLocaleString()}</span>
                    </div>
                    <small style="color: rgba(255,255,255,0.4); font-size: 10px;">${item.time}</small>
                </div>
            `;
        });
        itemsHTML += `
                </div>
            </div>
        `;
    }
    
    let expenseHTML = `
        <div style="text-align: center; margin-bottom: 16px;">
            <h3 style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: white;">${day} ${monthNames[month]} ${year}</h3>
            <p style="margin: 0; color: rgba(255, 255, 255, 0.6); font-size: 11px;">${archiveEntry.autoArchived ? '🤖 อัตโนมัติ' : '✋ บันทึกเอง'}</p>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div style="background: rgba(0,184,148,0.2); padding: 8px; border-radius: 8px; text-align: center;">
                <small style="color: rgba(255,255,255,0.6); font-size: 10px;">รับ</small><br>
                <strong style="color: #00b894; font-size: 13px;">+${archiveEntry.totalIn.toLocaleString()}</strong>
            </div>
            <div style="background: rgba(255,107,107,0.2); padding: 8px; border-radius: 8px; text-align: center;">
                <small style="color: rgba(255,255,255,0.6); font-size: 10px;">จ่าย</small><br>
                <strong style="color: #ff7675; font-size: 13px;">-${archiveEntry.totalOut.toLocaleString()}</strong>
            </div>
            <div style="background: rgba(100,200,255,0.2); padding: 8px; border-radius: 8px; text-align: center;">
                <small style="color: rgba(255,255,255,0.6); font-size: 10px;">คงเหลือ</small><br>
                <strong style="color: #64c8ff; font-size: 13px;">${(archiveEntry.totalIn - archiveEntry.totalOut).toLocaleString()}</strong>
            </div>
        </div>
        
        ${itemsHTML}
        
        <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; margin-top: 12px;">
            <button onclick="document.querySelector('[data-expense-modal]').parentNode.remove();" style="width: 100%; padding: 10px 16px; background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%); border: none; border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4); font-size: 13px;">ปิด</button>
        </div>
    `;
    
    modal.innerHTML = expenseHTML;
    modal.setAttribute("data-expense-modal", "true");
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

/* ===== EXPENSE COUNTDOWN (เช่นเดียวกับ Daily Goals) ===== */
let expenseCountdownTimer = null;
let countdownTimer = null;

/* ===== CALENDAR VIEW STATE ===== */
let calendarViewMonth = new Date().getMonth(); // 0-11
let calendarViewYear = new Date().getFullYear();
let lastCheckedMonth = new Date().getMonth(); // 🔍 เก็บเดือนที่เช็คล่าสุดไว้ compare
let lastCheckedYear = new Date().getFullYear();

/* ===== MONTH MANAGEMENT ===== */
let availableMonths = []; // Array of {year, month, label}

function generateAvailableMonths() {
    // Generate 12 months from past + 3 months ahead (total 15 months)
    const months = [];
    const today = new Date();
    const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    
    // Start from 11 months ago and go to 3 months ahead (total 15 months)
    for (let i = 11; i >= -3; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11
        
        months.push({
            year: year,
            month: month,
            label: `${monthNames[month]} ${year + 543}` // Thai year format
        });
    }
    
    availableMonths = months;
}


function ensureCalendarViewIsWithin12Months() {
    // ตรวจสอบว่าเข้าเดือนใหม่ (เปรียบเทียบกับการเช็คล่าสุด)
    generateAvailableMonths();
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // ถ้าเดือนปัจจุบันเปลี่ยน (เข้าเดือนใหม่จริง ๆ) และ calendar view คือเดือนเก่า
    if ((currentYear !== lastCheckedYear || currentMonth !== lastCheckedMonth) && 
        (calendarViewYear === lastCheckedYear && calendarViewMonth === lastCheckedMonth)) {
        // Auto-switch to current month เมื่อเข้าเดือนใหม่
        console.log(`📅 New month detected! Auto-switching from ${lastCheckedMonth + 1}/${lastCheckedYear} to ${currentMonth + 1}/${currentYear}`);
        calendarViewYear = currentYear;
        calendarViewMonth = currentMonth;
    }
    
    // อัพเดท lastChecked เสมอ
    lastCheckedYear = currentYear;
    lastCheckedMonth = currentMonth;
}



function showMonthSelector() {
    generateAvailableMonths();
    
    // Create overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    // Create modal
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 20px;
        max-width: 280px;
        width: 90%;
        max-height: 70vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    `;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    let monthsHTML = `
        <h3 style="margin: 0 0 16px; color: white; text-align: center; font-size: 16px; font-weight: bold;">📅 เลือกเดือน</h3>
    `;
    
    availableMonths.forEach((m, idx) => {
        const isSelected = m.year === calendarViewYear && m.month === calendarViewMonth;
        const isCurrent = m.year === currentYear && m.month === currentMonth;
        const isFuture = (m.year > currentYear) || (m.year === currentYear && m.month > currentMonth);
        
        let bgColor = isSelected ? 'linear-gradient(135deg, #f0ad4e 0%, #ec971f 100%)' : 'rgba(255,255,255,0.05)';
        let textColor = isSelected ? 'white' : 'rgba(255,255,255,0.8)';
        let borderColor = isSelected ? 'rgba(255,192,61,0.5)' : 'rgba(255,255,255,0.1)';
        
        // ทำให้เดือนปัจจุบันมี highlight บาง ๆ
        if (isCurrent && !isSelected) {
            bgColor = 'rgba(0,184,148,0.15)';
            borderColor = 'rgba(0,184,148,0.3)';
        }
        
        // ทำให้เดือนอนาคตมี highlight บาง ๆ
        if (isFuture && !isSelected && !isCurrent) {
            bgColor = 'rgba(240,173,78,0.15)';
            borderColor = 'rgba(240,173,78,0.3)';
        }
        
        const checkmark = isSelected ? ' ✓' : '';
        
        monthsHTML += `
            <button onclick="selectMonth(${m.year}, ${m.month}); document.querySelector('[data-month-selector]').parentNode.remove();" 
                style="width: 100%; padding: 12px 16px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 10px; color: ${textColor}; font-weight: 600; cursor: pointer; margin-bottom: 8px; transition: all 0.2s; text-align: left; font-size: 14px;"
                onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                ${m.label}${checkmark}
            </button>
        `;
    });
    
    modal.innerHTML = monthsHTML;
    modal.setAttribute("data-month-selector", "true");
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

window.selectMonth = (year, month) => {
    calendarViewYear = year;
    calendarViewMonth = month;
    render();
};

/* ===== CALENDAR HELPER FUNCTIONS ===== */
function generateCalendarDays(year, month) {
    let firstDay = new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat (International standard)
    // Keep as-is: Sunday=0, Monday=1, ..., Saturday=6
    
    const lastDate = new Date(year, month + 1, 0).getDate(); // Days in month
    const days = [];
    
    // Add previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
        days.push({ date: null, type: 'prev' });
    }
    
    // Add current month's days
    for (let d = 1; d <= lastDate; d++) {
        days.push({ date: d, type: 'current' });
    }
    
    // Add next month's leading days
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 0; i < remaining; i++) {
        days.push({ date: null, type: 'next' });
    }
    
    return days;
}

function getExpenseForDate(year, month, day) {
    if (!day) return { in: 0, out: 0 };
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const record = myExpenseArchive.find(a => a.date === dateStr);
    return record ? { in: record.totalIn || 0, out: record.totalOut || 0 } : { in: 0, out: 0 };
}

function getMonthlyTotals(year, month) {
    let totalIn = 0, totalOut = 0;
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    myExpenseArchive.forEach(a => {
        if (a.date.startsWith(monthStr)) {
            totalIn += a.totalIn || 0;
            totalOut += a.totalOut || 0;
        }
    });
    return { in: totalIn, out: totalOut, balance: totalIn - totalOut };
}

function cleanupOldYearData() {
    // Remove archive data from previous years (keep only current year)
    const currentYear = new Date().getFullYear();
    const beforeCount = myExpenseArchive.length;
    myExpenseArchive = myExpenseArchive.filter(a => {
        const archiveYear = parseInt(a.date.split('-')[0]);
        return archiveYear === currentYear;
    });
    if (myExpenseArchive.length < beforeCount) {
        console.log(`🗑️ Cleaned up ${beforeCount - myExpenseArchive.length} old records from previous years`);
        save();
    }
}

function updateExpenseCountdown() {
    if (expenseCountdownTimer) {
        clearTimeout(expenseCountdownTimer);
        expenseCountdownTimer = null;
    }
    if (currentPage !== "expense") return;

    const el = document.getElementById("expense-timer");
    if (el) {
        const now = new Date();
        const tom = new Date();
        tom.setHours(24, 0, 0, 0);
        const diff = tom.getTime() - now.getTime();
        
        if (diff <= 0) {
            console.log("⏰ Midnight detected! Full page refresh...");
            render(); // เมื่อข้ามวัน ให้วาดหน้าจอใหม่ทันที
        } else {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            el.innerText = `⏱️ Auto Save in: ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
    }

    // หัวใจสำคัญ: สั่งให้รันตัวเองซ้ำทุก 1 วินาทีเมื่ออยู่ในหน้า Expense
    if (currentPage === "expense") {
        expenseCountdownTimer = setTimeout(updateExpenseCountdown, 1000);
    }
}

/* ===== TVM CALCULATOR ===== */
function renderTVMPage() {
    const bBtn = document.createElement("button"); bBtn.className = "back-btn"; bBtn.innerText = "🏠";
    bBtn.onclick = () => { settingsOpen = false; currentPage = "home"; render(); };
    const drawer = makeDrawer();
drawer.appendChild(themeBtn);
drawer.appendChild(zoomBtn);

app.appendChild(bBtn);
app.appendChild(settingsBtn);
app.appendChild(drawer);
    const title = document.createElement("h1"); title.innerText = "TVM Calculator"; app.appendChild(title);
    const container = document.createElement("div"); container.className = "goals-page";
    container.innerHTML = `
        <div class="tvm-card-new">
            <div class="tvm-label-thai">เงินต้นปัจจุบัน (PV)</div>
            <div class="tvm-row-thai"><input type="number" id="tvm_pv" placeholder="0.00"><button class="calc-btn" onclick="calcTVM('PV')">หา PV</button></div>
            <div class="tvm-label-thai">เงินจ่ายรายงวด (PMT)</div>
            <div class="tvm-row-thai"><input type="number" id="tvm_pmt" placeholder="0.00"><button class="calc-btn" onclick="calcTVM('PMT')">หา PMT</button></div>
            <div class="tvm-label-thai">เงินรวมในอนาคต (FV)</div>
            <div class="tvm-row-thai"><input type="number" id="tvm_fv" placeholder="0.00"><button class="calc-btn" onclick="calcTVM('FV')">หา FV</button></div>
            <div class="tvm-label-thai">ดอกเบี้ยต่อปี (%)</div>
            <div class="tvm-row-thai"><input type="number" id="tvm_rate" placeholder="เช่น 5"><button class="calc-btn" onclick="calcTVM('RATE')">หา %</button></div>
            <div class="tvm-label-thai">จำนวนงวด (N)</div>
            <div class="tvm-row-thai"><input type="number" id="tvm_periods" placeholder="เช่น 12"><button class="calc-btn" onclick="calcTVM('N')">หา N</button></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;"><label style="font-weight:bold;">ประเภทงวด:</label><select id="tvm_mode" style="padding:10px; border-radius:10px; border:1px solid #ddd;"><option value="0">ปลายงวด (End)</option><option value="1">ต้นงวด (Begin)</option></select></div>
            <button class="reset-btn-thai" onclick="resetTVM()">RESET</button>
            <div id="tvm_result" style="margin-top:10px; text-align:center; font-weight:bold; color:#00b894; font-size:20px;"></div>
        </div>
    `;
    app.appendChild(container);
}
window.resetTVM = () => { ['pv','pmt','fv','rate','periods'].forEach(id => document.getElementById('tvm_'+id).value = ''); document.getElementById('tvm_result').innerText = ''; };
window.calcTVM = (target) => {
    const pv = parseFloat(document.getElementById('tvm_pv').value) || 0;
    const pmt = parseFloat(document.getElementById('tvm_pmt').value) || 0;
    const fv = parseFloat(document.getElementById('tvm_fv').value) || 0;
    const rate = (parseFloat(document.getElementById('tvm_rate').value) || 0) / 100 / 12;
    const n = parseFloat(document.getElementById('tvm_periods').value) || 0;
    const mode = parseInt(document.getElementById('tvm_mode').value);
    let result = 0;
    if (target === 'FV') { const factor = Math.pow(1 + rate, n); result = -(pv * factor + pmt * (1 + rate * mode) * ((factor - 1) / rate)); document.getElementById('tvm_fv').value = Math.abs(result).toFixed(2); }
    else if (target === 'PV') { const factor = Math.pow(1 + rate, n); result = -(fv + pmt * (1 + rate * mode) * ((factor - 1) / rate)) / factor; document.getElementById('tvm_pv').value = Math.abs(result).toFixed(2); }
    else if (target === 'PMT') { const factor = Math.pow(1 + rate, n); result = -(pv * factor + fv) / ((1 + rate * mode) * ((factor - 1) / rate)); document.getElementById('tvm_pmt').value = Math.abs(result).toFixed(2); }
    document.getElementById('tvm_result').innerText = `คำนวณ ${target} สำเร็จ!`;
};

/* ===== GOALS LOGIC (With EXP) ===== */
function renderGoalsPage(type) {
    app.innerHTML = ""; const bBtn = document.createElement("button"); bBtn.className = "back-btn"; bBtn.innerText = "🏠";
    bBtn.onclick = () => { settingsOpen = false; currentPage = "home"; render(); };
    const drawer = makeDrawer();
drawer.appendChild(themeBtn);
drawer.appendChild(zoomBtn);

app.appendChild(bBtn);
app.appendChild(settingsBtn);
app.appendChild(drawer);
    const container = document.createElement("div"); container.className = "goals-page";
    container.innerHTML = `<h1>${type === "daily" ? "Daily Goals" : "Long-term Goals"}</h1>`;
    if(type === "daily") { const timer = document.createElement("div"); timer.className = "timer-box"; timer.id = "timer"; container.appendChild(timer); }
    const addBox = document.createElement("div"); addBox.className = "add-box";
    const input = document.createElement("input"); input.placeholder = "เพิ่มเป้าหมาย...";
    const btn = document.createElement("button"); btn.innerText = "＋ เพิ่ม";
    btn.onclick = () => { if(input.value.trim()){ (type === "daily" ? myDailyGoals : myLongTermGoals).push({ text: input.value.trim(), done: false }); save(); render(); } };
    addBox.appendChild(input); addBox.appendChild(btn); container.appendChild(addBox);
    (type === "daily" ? myDailyGoals : myLongTermGoals).forEach((g, i) => {
        const item = document.createElement("div"); item.className = `goal-item ${g.done ? 'done' : ''}`;
        item.innerHTML = `<span>${g.done ? '✅' : '⭕'}</span> <span style="flex:1; margin-left:10px;">${g.text}</span> <span class="del-btn" onclick="delGoal('${type}', ${i})">🗑️</span>`;
        item.onclick = () => { 
            const list = (type === "daily" ? myDailyGoals : myLongTermGoals);
            if (!list[i].done) {
                // 🗑️ ลบ addExp - ระบบ EXP ถูกลบแล้ว
                const completed = parseInt(localStorage.getItem("goalsCompleted") || "0") + 1;
                localStorage.setItem("goalsCompleted", completed);
            }
            list[i].done = !g.done; 
            save(); 
            updateAchievements(); // 🔥 เพิ่มตรงนี้เพื่อเช็ค Perfect Day
            render(); 
        };
        container.appendChild(item);
    });
    app.appendChild(container); if(type === "daily") updateCountdown();
}
window.delGoal = (type, i) => { if(confirm("ลบ?")){ (type === "daily" ? myDailyGoals : myLongTermGoals).splice(i, 1); save(); render(); } };

/* ===== MY NOTES (PRIVATE LOCK) ===== */

let notesCurrentFilter = "all"; // all, personal, work, other

function getLastUpdateDate(dateString) {
    if (!dateString) return "ไม่ระบุ";
    try {
        const noteDate = new Date(dateString);
        const today = new Date();
        const isToday = noteDate.toDateString() === today.toDateString();
        if (isToday) {
            return noteDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        } else {
            return noteDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        }
    } catch (e) {
        return dateString;
    }
}

function renderNotesPageNew() {
    app.innerHTML = "";
    
    const header = document.createElement("div");
    header.className = "notes-header";
    header.innerHTML = `<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;"><button class="back-btn" onclick="goHome()">🏠</button><h1 style="margin: 0; font-size: 28px; font-weight: 700; flex: 1; text-align: center;">My Notes</h1><div style="width: 60px;"></div></div>`;
    app.appendChild(header);
    
    const filterContainer = document.createElement("div");
    filterContainer.className = "notes-filter-container";
    const categories = [
        { id: "all", label: "ทั้งหมด", icon: "📚" },
        { id: "personal", label: "ส่วนตัว", icon: "👤" },
        { id: "work", label: "งาน", icon: "💼" },
        { id: "other", label: "อื่นๆ", icon: "✨" }
    ];
    categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = `notes-filter-btn ${notesCurrentFilter === cat.id ? 'active' : ''}`;
        btn.innerHTML = `${cat.icon} ${cat.label}`;
        btn.onclick = () => { notesCurrentFilter = cat.id; renderNotesPageNew(); };
        filterContainer.appendChild(btn);
    });
    app.appendChild(filterContainer);
    
    const filteredNotes = notesCurrentFilter === "all" ? myNotes : myNotes.filter(n => n.category === notesCurrentFilter);
    
    // Sort pinned notes to top
    const sortedNotes = [...filteredNotes].sort((a, b) => {
        if (a.pinned && b.pinned) return (b.pinOrder || 0) - (a.pinOrder || 0);
        if (a.pinned) return -1;
        if (b.pinned) return 1;
        return 0;
    });
    
    if (filteredNotes.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "notes-empty-state";
        emptyState.innerHTML = `<div style="text-align: center; padding: 60px 20px;"><div style="font-size: 72px; margin-bottom: 20px; opacity: 0.6;">📝</div><h2 style="margin: 0 0 10px; font-size: 24px; color: rgba(255,255,255,0.8);">ยังไม่มี Note</h2><p style="margin: 0; color: rgba(255,255,255,0.5); font-size: 14px;">กดปุ่มด้านล่างเพื่อสร้าง Note ใหม่</p></div>`;
        app.appendChild(emptyState);
    } else {
        const notesGrid = document.createElement("div");
        notesGrid.className = "notes-grid-container";
        sortedNotes.forEach((note, index) => {
            const card = document.createElement("div");
            card.className = "notes-grid-card";
            const categoryColor = { personal: "#ffd93d", work: "#ff6b6b", other: "#6bcf7f" }[note.category] || "#6bcf7f";
            
            // Apply bgColor if exists
            // Apply bgColor if exists
if (note.bgColor) {
    card.style.background = note.bgColor;
    
    // เพิ่มส่วนนี้ ▼▼▼
    // คำนวณสีตัวอักษรจากความสว่างของ background
    const brightness = getBrightness(note.bgColor);
    const textColor = brightness > 128 ? '#000000' : '#ffffff';
    
    // บังคับให้เปลี่ยนสีทั้ง card
    card.style.color = `${textColor} !important`;
    
    // ปรับสี child elements
    setTimeout(() => {
        const title = card.querySelector('.notes-card-title');
        const preview = card.querySelector('.notes-preview-text');
        const date = card.querySelector('.notes-card-date');
        const locked = card.querySelector('.notes-locked-text');
        
        if (title) title.style.color = `${textColor} !important`;
        if (preview) preview.style.color = `${textColor} !important`;
        if (date) date.style.color = `${textColor} !important`;
        if (locked) locked.style.color = `${textColor} !important`;
    }, 10);
    // ▲▲▲ เพิ่มจบ
}
            
            // Get preview text - show only 2-3 lines
            let previewText = "(ไม่มีเนื้อหา)";
            if (note.body && note.body.trim()) {
                const lines = note.body.split('\n').filter(line => line.trim()).slice(0, 2);
                previewText = lines.join('\n').substring(0, 100);
            }
            
            const isLocked = note.password && !unlockedNotes.includes(note.id);
            card.style.borderLeftColor = categoryColor;
            
            // Format date properly - handle various date formats
            let dateStr = new Date().toLocaleString('th-TH');
            if (note.date) {
                try {
                    // Check if it's already formatted Thai date
                    if (typeof note.date === 'string' && note.date.includes('/')) {
                        dateStr = note.date;
                    } else {
                        const dateObj = new Date(note.date);
                        if (!isNaN(dateObj.getTime())) {
                            dateStr = note.date;
                        }
                    }
                } catch (e) {
                    console.log('Date parse error:', note.date);
                    dateStr = new Date().toLocaleString('th-TH');
                }
            }
            
            // คำนวณสีตัวอักษรจากสี background
let textColor = '#ffffff';
if (note.bgColor) {
    const brightness = getBrightness(note.bgColor);
    textColor = brightness > 128 ? '#000000' : '#ffffff';
}

card.innerHTML = `
    <div class="notes-card-header">
        <h3 class="notes-card-title" style="color: ${textColor} !important;">${note.pinned ? '📌 ' : ''}${note.title || "ไม่มีชื่อ"}</h3>
        ${note.password ? '<span class="notes-card-lock">🔒</span>' : ''}
    </div>
    <div class="notes-card-preview">
        ${isLocked ? `<span class="notes-locked-text" style="color: ${textColor} !important;">โน้ตนี้ถูกล็อคอยู่</span>` : `<span class="notes-preview-text" style="color: ${textColor} !important;">${previewText}</span>`}
    </div>
    <div class="notes-card-footer">
        <span class="notes-card-date" style="color: ${textColor} !important;">📅 ${dateStr}</span>
    </div>
`;
            
            // Click to edit
            card.onclick = () => { openNoteEditor(note.id); };
            
            // Long press (500ms) to delete with confirmation
            let pressTimer;
            card.onmousedown = () => {
                pressTimer = setTimeout(() => {
                    showDeleteConfirmModal(note, myNotes.indexOf(note));
                }, 500);
            };
            card.onmouseup = () => clearTimeout(pressTimer);
            card.onmouseleave = () => clearTimeout(pressTimer);
            
            // Touch long press
            card.ontouchstart = () => {
                pressTimer = setTimeout(() => {
                    showDeleteConfirmModal(note, myNotes.indexOf(note));
                }, 500);
            };
            card.ontouchend = () => clearTimeout(pressTimer);
            
            notesGrid.appendChild(card);
        });
        app.appendChild(notesGrid);
    }
    
    const fab = document.createElement("button");
    fab.className = "notes-fab";
    fab.innerHTML = "✏️";
    fab.onclick = () => openNoteEditor(null);
    app.appendChild(fab);
}

// 🆕 หน้าสร้าง Note ใหม่ (แทน modal)
function openNotesCreatePage() {
    app.innerHTML = "";
    
    const header = document.createElement("div");
    header.className = "notes-header";
    header.innerHTML = `<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;"><button class="back-btn" onclick="goNotesFromCreate()">⬅️</button><h1 style="margin: 0; font-size: 28px; font-weight: 700; flex: 1; text-align: center;">สร้าง Note ใหม่</h1><div style="width: 60px;"></div></div>`;
    app.appendChild(header);
    
    const formContainer = document.createElement("div");
    formContainer.className = "notes-create-page-container";
    formContainer.innerHTML = `
        <div class="notes-create-form">
            <div class="form-group">
                <label>หัวข้อ</label>
                <input type="text" id="notes-new-title" placeholder="ใส่หัวข้อ..." class="form-input">
            </div>
            
            <div class="form-group">
                <label>เนื้อหา</label>
                <textarea id="notes-new-body" placeholder="เขียนเนื้อหา..." class="form-textarea" style="min-height: 300px; resize: vertical;"></textarea>
            </div>
            
            <div class="form-group">
                <label>หมวดหมู่</label>
                <div class="category-selector-large">
                    <button class="category-option-large active" data-category="personal" onclick="selectCategoryCreate(this, 'personal')">
                        <span class="category-dot" style="background: #ffd93d;"></span>
                        <span>👤 ส่วนตัว</span>
                    </button>
                    <button class="category-option-large" data-category="work" onclick="selectCategoryCreate(this, 'work')">
                        <span class="category-dot" style="background: #ff6b6b;"></span>
                        <span>💼 งาน</span>
                    </button>
                    <button class="category-option-large" data-category="other" onclick="selectCategoryCreate(this, 'other')">
                        <span class="category-dot" style="background: #6bcf7f;"></span>
                        <span>✨ อื่นๆ</span>
                    </button>
                </div>
            </div>
            
            <div class="form-group">
                <label>ล็อคด้วยรหัสผ่าน (ไม่บังคับ)</label>
                <div style="display: flex; gap: 8px;">
                    <input type="password" id="notes-new-password" placeholder="ใส่รหัสผ่าน..." class="form-input" style="flex: 1;">
                    <button class="btn-secondary" onclick="togglePasswordFieldCreate()">👁️</button>
                </div>
            </div>
            
            <div class="notes-create-buttons">
                <button class="btn-cancel" onclick="goNotesFromCreate()">ยกเลิก</button>
                <button class="btn-primary" onclick="saveNewNote()">💾 บันทึก</button>
            </div>
        </div>
    `;
    app.appendChild(formContainer);
    window.notesSelectedCategory = "personal";
}

function goNotesFromCreate() { 
    notesCurrentFilter = "all"; 
    renderNotesPageNew(); 
}

function selectCategoryCreate(el, category) { 
    document.querySelectorAll('.category-option-large').forEach(btn => btn.classList.remove('active')); 
    el.classList.add('active'); 
    window.notesSelectedCategory = category; 
}

function togglePasswordFieldCreate() { 
    const input = document.getElementById('notes-new-password'); 
    input.type = input.type === 'password' ? 'text' : 'password'; 
}

async function saveNewNote() {
    const title = document.getElementById('notes-new-title').value.trim();
    const body = document.getElementById('notes-new-body').value.trim();
    const category = window.notesSelectedCategory || 'personal';
    const passwordRaw = document.getElementById('notes-new-password').value;
    if (!title && !body) { alert('กรุณากรอกหัวข้อหรือเนื้อหาอย่างน้อยอันหนึ่ง'); return; }
    let password = "";
    if (passwordRaw) { password = await hashPassword(passwordRaw); }
    const newNote = { id: Date.now(), title: title || "ไม่มีชื่อ", body: body, category: category, date: new Date().toLocaleString('th-TH'), password: password, bgColor: null };
    myNotes.unshift(newNote);
    // 🗑️ ลบ addExp - ระบบ EXP ถูกลบแล้ว
    save();
    goNotesFromCreate();
    renderNotesPageNew();
}

function showDeleteConfirmModal(note, index) {
    // สร้าง overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    // สร้าง modal
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 32px 24px;
        max-width: 300px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease-out;
    `;
    
    // เพิ่ม animation
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    if (!document.querySelector("style[data-modal-anim]")) {
        style.setAttribute("data-modal-anim", "true");
        document.head.appendChild(style);
    }
    
    modal.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: white;">ลบโน้ต?</h3>
            <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.6); font-size: 13px;">คุณแน่ใจว่าต้องการลบ "<span style="font-weight: 600; color: rgba(255, 255, 255, 0.8);">${note.title || "โน้ต"}</span>" หรือไม่</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="cancel-delete" style="flex: 1; padding: 12px 20px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">ยกเลิก</button>
                <button id="confirm-delete" style="flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%); border: none; border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);">ลบ</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Event listeners
    document.getElementById("cancel-delete").onclick = () => {
        overlay.remove();
    };
    
    document.getElementById("confirm-delete").onclick = () => {
        myNotes.splice(index, 1);
        save();
        overlay.remove();
        renderNotesPageNew();
        showNotification("✅ ลบโน้ตสำเร็จ", `"${note.title || "โน้ต"}" ถูกลบออก`, "success");
    };
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

// Function เตือนเวลายังไม่บันทึก
function showUnsavedChangesModal() {
    // สร้าง overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    // สร้าง modal
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 32px 24px;
        max-width: 300px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease-out;
    `;
    
    modal.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: white;">มีการเปลี่ยนแปลง</h3>
            <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.6); font-size: 13px;">คุณยังไม่ได้บันทึกการเปลี่ยนแปลง ต้องการออกจากหรือไม่?</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="cancel-unsaved" style="flex: 1; padding: 12px 20px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">ยกเลิก</button>
                <button id="confirm-unsaved" style="flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #FFB74D, #FF9800); border: none; border-radius: 10px; color: #000000; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);">ออก</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Event listeners
    document.getElementById("cancel-unsaved").onclick = () => {
        overlay.remove();
    };
    
    document.getElementById("confirm-unsaved").onclick = () => {
    overlay.remove();
    notesCurrentFilter = "all";
    unlockedNotes = [];
    renderNotesPageNew();
};
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

function handleNoteClick(noteId) { openNoteEditor(noteId); }
function handleNoteDelete(index) { if (confirm("ต้องการลบโน้ตนี้หรือไม่?")) { myNotes.splice(index, 1); save(); renderNotesPageNew(); } }
function goHome() { unlockedNotes = []; settingsOpen = false; currentPage = "home"; notesCurrentFilter = "all"; render(); }

// ==================== NEW NOTE EDITOR ====================

// ==================== NEW NOTE EDITOR (IMPROVED) ====================
function openNoteEditor(noteId) {
    const note = noteId ? myNotes.find(n => n.id === noteId) : null;
    const isNewNote = noteId === null;
    
    // Check password
    if (note && note.password && !unlockedNotes.includes(note.id)) {
        showUnlockPasswordModal(noteId, note);
        return;
    }
    
    app.innerHTML = "";
    const selectedCategory = note ? note.category : "personal";
    const selectedColor = note ? (note.bgColor || "#1a1a1a") : "#1a1a1a";
    
    // Main container with background color
    const brightness = getBrightness(selectedColor);
const computedTextColor = brightness > 128 ? '#000000' : '#ffffff';
    const container = document.createElement("div");
    container.style.cssText = `
    background: ${selectedColor};
    min-height: 100vh;
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    color: ${computedTextColor};
    margin: 0;
    padding: 0;
    position: fixed;
    top: 0;
    left: 0;
`;
    
    // Top header
    const topHeader = document.createElement("div");
    topHeader.style.cssText = `
        padding: 16px;
        border-bottom: 1px solid #333;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    topHeader.innerHTML = `
        <button style="background: none; border: none; font-size: 24px; cursor: pointer; color: #fff; padding: 0; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;" onclick="goNotesBack()">←</button>
        <div style="display: flex; gap: 12px; align-items: center;">
            <button id="note-pin-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: ${note && note.pinned ? '#FFD700' : '#888'}; padding: 0; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; ${note && note.pinned ? 'text-shadow: 0 0 12px rgba(255, 215, 0, 0.8), 0 0 24px rgba(255, 215, 0, 0.4);' : ''}" onclick="togglePinNote(${noteId})">📌</button>
            <div style="position: relative;">
                <button id="note-menu-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #888; padding: 0; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="toggleNoteMenu()">
                    <div style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid #888; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.2s;">⋯</div>
                </button>
                <div id="note-menu-dropdown" style="position: absolute; top: 100%; right: 0; background: #2a2a2a; border: 1px solid #444; border-radius: 8px; min-width: 180px; display: none; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5); margin-top: 8px;">
                    <button onclick="toggleLockNote(${noteId})" style="width: 100%; padding: 12px 16px; text-align: left; background: none; border: none; color: #fff; cursor: pointer; font-size: 14px; border-bottom: 1px solid #444; transition: background 0.2s;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">🔒 ${note && note.password ? 'ปลดล็อก' : 'ล็อค'}โน้ต</button>
                    <button onclick="deleteNoteFromEditor(${noteId})" style="width: 100%; padding: 12px 16px; text-align: left; background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 14px; transition: background 0.2s;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">🗑️ ลบโน้ต</button>
                </div>
            </div>
        </div>
    `;
    container.appendChild(topHeader);
    
    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.style.cssText = `
        padding: 12px 16px;
        border-bottom: 1px solid #333;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    `;
    const getCatColor = (cat) => ({personal: "#ffd93d", work: "#ff6b6b", other: "#6bcf7f"}[cat] || "#6bcf7f");
    toolbar.innerHTML = `
        <div style="font-size: 13px; color: ${computedTextColor};">${note ? note.date : new Date().toLocaleString('th-TH')}</div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <div id="note-category-dot" style="width: 14px; height: 14px; border-radius: 50%; background: ${getCatColor(selectedCategory)}; transition: background 0.2s;"></div>
            <div style="position: relative; display: inline-block;">
                <button id="note-category-btn" style="background: transparent; border: none; color: #fff; font-size: 13px; cursor: pointer; outline: none; padding: 4px 8px; transition: color 0.2s;" onmouseover="this.style.color='#ffd700'" onmouseout="this.style.color='#fff'" onclick="toggleCategoryDropdown()">
                    ${selectedCategory === 'personal' ? 'ส่วนตัว' : selectedCategory === 'work' ? 'งาน' : 'อื่นๆ'}
                </button>
                <div id="note-category-dropdown" style="position: absolute; top: 100%; left: 0; background: #2a2a2a; border: 1px solid #444; border-radius: 8px; min-width: 140px; display: none; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5); margin-top: 8px;">
                    <button onclick="selectCategoryDropdown('personal')" style="width: 100%; padding: 12px 16px; text-align: left; background: none; border: none; color: #fff; cursor: pointer; font-size: 13px; border-bottom: 1px solid #444; transition: background 0.2s;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">👤 ส่วนตัว</button>
                    <button onclick="selectCategoryDropdown('work')" style="width: 100%; padding: 12px 16px; text-align: left; background: none; border: none; color: #fff; cursor: pointer; font-size: 13px; border-bottom: 1px solid #444; transition: background 0.2s;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">💼 งาน</button>
                    <button onclick="selectCategoryDropdown('other')" style="width: 100%; padding: 12px 16px; text-align: left; background: none; border: none; color: #fff; cursor: pointer; font-size: 13px; transition: background 0.2s;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">✨ อื่นๆ</button>
                </div>
            </div>
        </div>
        <div style="display: flex; gap: 8px; margin-left: auto; align-items: center;">
            ${!isNewNote ? `<button id="note-edit-btn" style="background: linear-gradient(135deg, #FFD54F, #FBC02D); border: none; font-size: 14px; cursor: pointer; color: #000000; padding: 6px 12px; transition: all 0.3s; border-radius: 6px; font-weight: 600; box-shadow: 0 2px 8px rgba(0, 153, 204, 0.3); display: flex; align-items: center; gap: 4px;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0, 153, 204, 0.5)'; this.style.transform='translateY(-1px)'" onmouseout="this.style.boxShadow='0 2px 8px rgba(0, 153, 204, 0.3)'; this.style.transform='translateY(0)'" onclick="toggleEditModeNote()">✏️ แก้ไข</button>` : ''}
            <button id="note-save-btn" style="background: linear-gradient(135deg, #4CAF50, #388E3C); border: none; font-size: 14px; cursor: pointer; color: #000000; padding: 6px 12px; ${isNewNote ? 'display: flex;' : 'display: none;'} transition: all 0.3s; border-radius: 6px; font-weight: 600; box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3); align-items: center; gap: 4px;" onmouseover="this.style.boxShadow='0 4px 12px rgba(76, 175, 80, 0.5)'; this.style.transform='translateY(-1px)'" onmouseout="this.style.background='linear-gradient(135deg, #4CAF50, #388E3C)'; this.style.boxShadow='0 2px 8px rgba(76, 175, 80, 0.3)'; this.style.transform='translateY(0)'" onclick="saveNoteEditor()">✓ บันทึก</button>
            <div style="position: relative; display: inline-block;">
                <button id="note-color-btn" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #888; padding: 4px 8px; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#888'" onclick="toggleColorPicker()">🎨</button>
                <div id="note-color-picker" style="position: absolute; top: 100%; right: 0; background: #2a2a2a; border: 1px solid #444; border-radius: 8px; padding: 12px; display: none; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: none; grid-template-columns: repeat(3, 40px); gap: 8px; margin-top: 8px;">
                    <div onclick="changeNoteColor('#1a1a1a')" style="width: 32px; height: 32px; border-radius: 4px; background: #1a1a1a; border: 2px solid #555; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="ดำ"></div>
                    <div onclick="changeNoteColor('#ff6b6b')" style="width: 32px; height: 32px; border-radius: 4px; background: #ff6b6b; border: 2px solid #555; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="แดง"></div>
                    <div onclick="changeNoteColor('#4ecdc4')" style="width: 32px; height: 32px; border-radius: 4px; background: #4ecdc4; border: 2px solid #555; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="สีเขียวน้ำ"></div>
                    <div onclick="changeNoteColor('#9b59b6')" style="width: 32px; height: 32px; border-radius: 4px; background: #9b59b6; border: 2px solid #555; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="ม่วง"></div>
                    <div onclick="changeNoteColor('#f1c40f')" style="width: 32px; height: 32px; border-radius: 4px; background: #f1c40f; border: 2px solid #555; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="เหลือง"></div>
                    <div onclick="changeNoteColor('#3498db')" style="width: 32px; height: 32px; border-radius: 4px; background: #3498db; border: 2px solid #555; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="น้ำเงิน"></div>
                </div>
            </div>
        </div>
    `;
    container.appendChild(toolbar);
    
    // Title section
    const titleSection = document.createElement("div");
    titleSection.style.cssText = `
        padding: 20px 16px 12px;
        border-bottom: 1px solid #333;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    `;
    titleSection.innerHTML = `
        <div style="flex: 1;">
            <input type="text" id="note-title" placeholder="หัวข้อ" value="${note ? note.title : ''}" ${isNewNote ? '' : 'readonly'} style="background: transparent; border: none; outline: none; color: #fff; font-family: inherit; font-size: 28px; font-weight: 500; line-height: 1.3; width: 100%;">
        </div>
        <button style="background: none; border: none; font-size: 22px; cursor: pointer; color: #666; padding: 4px 8px; margin-left: 12px;">📝</button>
    `;
    container.appendChild(titleSection);
    
    // Content area
    const contentArea = document.createElement("div");
    contentArea.style.cssText = `
        flex: 1;
        padding: 20px 16px;
        overflow-y: auto;
        background: rgba(0, 0, 0, 0.2);
    `;
    contentArea.innerHTML = `<textarea id="note-content" placeholder="ธรรมชาติสไนอาทีที่นี่..." ${isNewNote ? '' : 'readonly'} style="width: 100%; background: transparent; border: none; outline: none; color: #fff; font-family: inherit; font-size: 15px; resize: none; line-height: 1.7; min-height: 400px; padding: 0;">${note ? note.body : ''}</textarea>`;
    container.appendChild(contentArea);
    
    app.appendChild(container);
  // เพิ่มส่วนนี้ ▼▼▼
setTimeout(() => {
    const titleInput = document.getElementById('note-title');
    const contentInput = document.getElementById('note-content');
    if (titleInput) titleInput.style.color = computedTextColor;
    if (contentInput) contentInput.style.color = computedTextColor;
}, 50);
// ▲▲▲ เพิ่มจบ  
  
    // Store editing state
    window.noteEditing = {
        id: noteId,
        note: note,
        category: selectedCategory,
        isEditMode: isNewNote,
        isNewNote: isNewNote,
        color: selectedColor
    };
}

function changeNoteCategoryEditor(category) {
    window.noteEditing.category = category;
    const dot = document.getElementById('note-category-dot');
    const colors = {personal: "#ffd93d", work: "#ff6b6b", other: "#6bcf7f"};
    if (dot) dot.style.background = colors[category];
}

function toggleCategoryDropdown() {
    const dropdown = document.getElementById('note-category-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

function selectCategoryDropdown(category) {
    changeNoteCategoryEditor(category);
    const btn = document.getElementById('note-category-btn');
    const dropdown = document.getElementById('note-category-dropdown');
    const colors = {personal: "#ffd93d", work: "#ff6b6b", other: "#6bcf7f"};
    const labels = {personal: "ส่วนตัว", work: "งาน", other: "อื่นๆ"};
    
    if (btn) btn.textContent = labels[category];
    if (dropdown) dropdown.style.display = 'none';
  
    enableEditMode();
}

function toggleColorPicker() {
    const picker = document.getElementById('note-color-picker');
    if (picker) {
        picker.style.display = picker.style.display === 'none' ? 'grid' : 'none';
    }
}

// Function สลับปุ่มแก้ไข ↔ บันทึก
function enableEditMode() {
    const editBtn = document.getElementById('note-edit-btn');
    const saveBtn = document.getElementById('note-save-btn');
    
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'flex';
    
    window.noteEditing.isEditMode = true;
}

function changeNoteColor(color) {
    const container = document.querySelector('[style*="background:"]');
    if (container) {
        container.style.background = color;
        
        // ตรวจสอบว่าสีเข้ม หรือ สีอ่อน แล้วเปลี่ยนสีตัวอักษร
        const brightness = getBrightness(color);
        const textColor = brightness > 128 ? '#000000' : '#ffffff';
        
        container.style.color = textColor;
        
        // เปลี่ยนสี input, textarea, h1 ด้วย
        const titleInput = document.getElementById('note-title');
        const contentInput = document.getElementById('note-content');
        if (titleInput) titleInput.style.color = textColor;
        if (contentInput) contentInput.style.color = textColor;
    }
    window.noteEditing.color = color;
    document.getElementById('note-color-picker').style.display = 'none';
  
    enableEditMode();
}

// ฟังก์ชันช่วยหาความสว่างของสี (Brightness calculation)
function getBrightness(color) {
    // แปลง hex เป็น RGB
    let r, g, b;
    
    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    }
    
    // คำนวณ brightness (0-255)
    // สูตร: (R * 299 + G * 587 + B * 114) / 1000
    return (r * 299 + g * 587 + b * 114) / 1000;
}

function toggleNoteMenu() {
    const dropdown = document.getElementById('note-menu-dropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

function toggleEditModeNote() {
    const titleInput = document.getElementById('note-title');
    const contentInput = document.getElementById('note-content');
    const editBtn = document.getElementById('note-edit-btn');
    const saveBtn = document.getElementById('note-save-btn');
    
    if (!titleInput || !contentInput) return;
    
    window.noteEditing.isEditMode = !window.noteEditing.isEditMode;
    
    if (window.noteEditing.isEditMode) {
        titleInput.removeAttribute('readonly');
        contentInput.removeAttribute('readonly');
        if (editBtn) editBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'flex';
        titleInput.focus();
    } else {
        titleInput.setAttribute('readonly', '');
        contentInput.setAttribute('readonly', '');
        if (editBtn) editBtn.style.display = 'flex';
        if (saveBtn) saveBtn.style.display = 'none';
    }
}

function saveNoteEditor() {
    const title = document.getElementById('note-title').value.trim() || "ไม่มีชื่อ";
    const body = document.getElementById('note-content').value.trim();
    const category = window.noteEditing.category || "personal";
    const color = window.noteEditing.color || "#1a1a1a";
    const brightness = getBrightness(color);
const textColor = brightness > 128 ? '#000000' : '#ffffff';
    
    if (!title && !body) {
        alert('กรุณากรอกหัวข้อหรือเนื้อหา');
        return;
    }
    
    if (window.noteEditing.isNewNote) {
        // Create new - directly save and go back
        const newNote = {
            id: Date.now(),
            title: title,
            body: body,
            category: category,
            date: new Date().toLocaleString('th-TH'),
            password: "",
            bgColor: color,
            textColor: textColor,
            pinned: false,
            pinOrder: 0
        };
        myNotes.unshift(newNote);
        // 🗑️ ลบ addExp - ระบบ EXP ถูกลบแล้ว
        save();
        renderNotesPageNew();
        goNotesBack();
    } else {
        // Edit existing - stay in edit mode
        const note = myNotes.find(n => n.id === window.noteEditing.id);
        if (note) {
            note.title = title;
            note.body = body;
            note.category = category;
            note.date = new Date().toLocaleString('th-TH');
            note.bgColor = color;
            note.textColor = textColor;
        }
        save();
        renderNotesPageNew();
        toggleEditModeNote();
    }
}

function togglePinNote(noteId) {
    if (!noteId) return;
    const note = myNotes.find(n => n.id === noteId);
    if (note) {
        note.pinned = !note.pinned;
        if (note.pinned) {
            // ให้อันแรกที่ปักหมุดเป็นอันบนสุด
            const pinnedNotes = myNotes.filter(n => n.pinned);
            pinnedNotes.forEach((n, idx) => {
                n.pinOrder = pinnedNotes.length - idx;
            });
        }
        save();
        // Update UI instantly
        const pinBtn = document.getElementById('note-pin-btn');
        if (pinBtn) {
            pinBtn.style.color = note.pinned ? '#FFD700' : '#888';
            pinBtn.style.textShadow = note.pinned ? '0 0 12px rgba(255, 215, 0, 0.8), 0 0 24px rgba(255, 215, 0, 0.4)' : 'none';
            pinBtn.style.transition = 'all 0.3s ease';
        }
    }
}

// ===== PASSWORD INPUT POPUP FOR UNLOCK =====
function showUnlockPasswordModal(noteId, note) {
    // สร้าง overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    // สร้าง modal
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 32px 24px;
        max-width: 300px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease-out;
    `;
    
    // เพิ่ม animation
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    if (!document.querySelector("style[data-modal-anim]")) {
        style.setAttribute("data-modal-anim", "true");
        document.head.appendChild(style);
    }
    
    modal.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
            <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: white;">โน้ตถูกล็อค</h3>
            <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.6); font-size: 13px;">โปรดใส่รหัสผ่านเพื่อเข้าถึง</p>
            <input type="password" id="unlock-password" placeholder="ใส่รหัสผ่าน..." style="width: 100%; padding: 12px 16px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: white; font-size: 14px; margin-bottom: 16px; box-sizing: border-box; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='rgba(255, 255, 255, 0.4)'" onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'">
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="cancel-unlock" style="flex: 1; padding: 12px 20px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">ยกเลิก</button>
                <button id="confirm-unlock" style="flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #00b894 0%, #00a085 100%); border: none; border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0, 184, 148, 0.4);">ปลดล็อค</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const passwordInput = document.getElementById("unlock-password");
    
    // Focus input
    setTimeout(() => passwordInput.focus(), 100);
    
    // Event listeners
    document.getElementById("cancel-unlock").onclick = () => {
        overlay.remove();
    };
    
    document.getElementById("confirm-unlock").onclick = async () => {
        const inputPassword = passwordInput.value;
        if (!inputPassword) return;
        
        const hashed = await hashPassword(inputPassword);
        if (hashed === note.password) {
            unlockedNotes.push(note.id);
            overlay.remove();
            openNoteEditor(noteId);
        } else {
            passwordInput.style.borderColor = '#ff6b6b';
            passwordInput.style.background = 'rgba(255, 107, 107, 0.1)';
            passwordInput.value = '';
            passwordInput.placeholder = '❌ รหัสไม่ถูกต้อง';
            setTimeout(() => {
                passwordInput.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                passwordInput.style.background = 'rgba(255, 255, 255, 0.05)';
                passwordInput.placeholder = 'ใส่รหัสผ่าน...';
            }, 1000);
        }
    };
    
    // Enter key
    passwordInput.onkeypress = (e) => {
        if (e.key === 'Enter') document.getElementById("confirm-unlock").click();
    };
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

// ===== UPDATED FUNCTIONS =====
function toggleLockNote(noteId) {
    if (!noteId) return;
    const note = myNotes.find(n => n.id === noteId);
    if (!note) return;
    
    if (note.password) {
        // ถ้ามี password = ปลดล็อค
        note.password = '';
        save();
        openNoteEditor(noteId);
    } else {
        // ถ้าไม่มี password = ล็อค (ตั้งรหัส)
        showSetPasswordModal(noteId, note);
    }
}

function showSetPasswordModal(noteId, note) {
    // สร้าง overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    // สร้าง modal
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 32px 24px;
        max-width: 300px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease-out;
    `;
    
    // เพิ่ม animation
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    if (!document.querySelector("style[data-modal-anim]")) {
        style.setAttribute("data-modal-anim", "true");
        document.head.appendChild(style);
    }
    
    modal.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
            <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: white;">ตั้งรหัสผ่าน</h3>
            <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.6); font-size: 13px;">สร้างรหัสผ่านเพื่อปกป้องโน้ต</p>
            <input type="password" id="set-password" placeholder="ใส่รหัสผ่าน..." style="width: 100%; padding: 12px 16px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: white; font-size: 14px; margin-bottom: 16px; box-sizing: border-box; outline: none; transition: all 0.2s;" onfocus="this.style.borderColor='rgba(255, 255, 255, 0.4)'" onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'">
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="cancel-set-password" style="flex: 1; padding: 12px 20px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">ยกเลิก</button>
                <button id="confirm-set-password" style="flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%); border: none; border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);">ล็อค</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const passwordInput = document.getElementById("set-password");
    
    // Focus input
    setTimeout(() => passwordInput.focus(), 100);
    
    // Event listeners
    document.getElementById("cancel-set-password").onclick = () => {
        overlay.remove();
    };
    
    document.getElementById("confirm-set-password").onclick = async () => {
        const inputPassword = passwordInput.value;
        if (!inputPassword || !inputPassword.trim()) {
            passwordInput.style.borderColor = '#ff6b6b';
            passwordInput.style.background = 'rgba(255, 107, 107, 0.1)';
            return;
        }
        
        const hashed = await hashPassword(inputPassword);
        note.password = hashed;
        save();
        overlay.remove();
        openNoteEditor(noteId);
    };
    
    // Enter key
    passwordInput.onkeypress = (e) => {
        if (e.key === 'Enter') document.getElementById("confirm-set-password").click();
    };
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

function deleteNoteFromEditor(noteId) {
    if (!noteId) return;
    const note = myNotes.find(n => n.id === noteId);
    if (!note) return;
    
    showDeleteConfirmModal(note, myNotes.indexOf(note));
}

function goNotesBack() {
    // ตรวจสอบว่ามีการเปลี่ยนแปลงและยังไม่บันทึก
    const titleInput = document.getElementById('note-title');
    const contentInput = document.getElementById('note-content');
    
    if (window.noteEditing && window.noteEditing.isEditMode) {
        const currentTitle = titleInput ? titleInput.value : '';
        const currentContent = contentInput ? contentInput.value : '';
        const originalTitle = window.noteEditing.note ? window.noteEditing.note.title : '';
        const originalContent = window.noteEditing.note ? window.noteEditing.note.body : '';
        
        // ถ้ามีการเปลี่ยนแปลง ให้เตือน
        if (currentTitle !== originalTitle || currentContent !== originalContent) {
            showUnsavedChangesModal();
            return;
        }
    }
    
    notesCurrentFilter = "all";  
    unlockedNotes = [];
    renderNotesPageNew();
}

// ======================================================
// ======================================================

// Override renderNotesPage with new version
const originalRenderNotesPage = window.renderNotesPage;
window.renderNotesPage = renderNotesPageNew;

window.unlockNote = async (id, pass) => {
    const input = prompt("ใส่รหัสผ่าน:");
    if (input === null) return;
    const hashed = await hashPassword(input);
    if (hashed === pass) { unlockedNotes.push(id); render(); } 
    else { alert("รหัสไม่ถูกต้อง!"); }
};

window.tryEditNote = async (id, pass) => {
    if (pass && !unlockedNotes.includes(id)) {
        const input = prompt("ใส่รหัสก่อนแก้ไข:");
        if (input === null) return;
        const hashed = await hashPassword(input);
        if (hashed !== pass) { alert("รหัสไม่ถูกต้อง!"); return; }
    }
    editingNoteId = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
};
window.delNote = (i) => { if(confirm("ลบโน้ต?")){ myNotes.splice(i, 1); save(); render(); } };

/* ===== AUTO-RESET EXPENSE ON NEW DAY ===== */
function resetExpenseIfNeeded() {
    const today = getToday();
    if (lastExpenseResetDate !== today) {
        console.log(`🔄 New day! Resetting daily expenses: ${lastExpenseResetDate} → ${today}`);
        myExpenses = []; // Clear today's entries
        lastExpenseResetDate = today;
        localStorage.setItem("lastExpenseResetDate", today);
        save();
    }
}

// เปลี่ยนฟังก์ชันเดิมเป็นอันนี้ครับ
function updateCountdown() {
    // Clear previous timer to prevent overlapping
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }

    // 1. เช็คและรีเซ็ตค่าเสมอไม่ว่าจะอยู่หน้าไหน
    resetDailyGoalsIfNeeded();
    //autoArchiveExpenseIfNeeded();  // 💰 เพิ่มการบันทึก expense อัตโนมัติ
    resetTrackerIfNeeded(); // 🔥 ใช้ฟังก์ชัน reset ใหม่ (เหมือน Daily Goals)
    resetExpenseIfNeeded(); // 📊 รีเซ็ตรายการรายรับรายจ่ายเมื่อข้ามวัน
    cleanupOldYearData(); // 🗑️ ลบข้อมูลเก่าจากปีที่แล้ว

    // 2. ถ้าหน้าจอมีตัวเลขตัวนับเวลา (id="timer") ให้คำนวณและแสดงผล
    const el = document.getElementById("timer");
    if (el) {
        const now = new Date();
        const tom = new Date();
        tom.setHours(24, 0, 0, 0);
        const diff = tom.getTime() - now.getTime();
        
        if (diff <= 0) {
            console.log("⏰ Midnight detected! Full page refresh...");
            render(); // เมื่อข้ามวัน ให้วาดหน้าจอใหม่ทันที
        } else {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            el.innerText = `Auto Reset in: ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
    }

    // 3. หัวใจสำคัญ: สั่งให้รันตัวเองซ้ำทุก 1 วินาทีเสมอ (ถาวร)
    countdownTimer = setTimeout(updateCountdown, 1000);
}

// 4. บังคับให้หัวใจเริ่มเต้นครั้งแรกทันทีที่เปิดแอป (วางไว้บรรทัดสุดท้ายของไฟล์เลยครับ)
updateCountdown();

/* ===== CSS FOR NEW SYSTEMS ===== */
const style = document.createElement('style');
style.innerHTML = `
    .exp-container { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 15px; margin-bottom: 20px; width: 100%; max-width: 400px; text-align: left; }
    .exp-bar-bg { background: #333; height: 12px; border-radius: 6px; overflow: hidden; margin: 5px 0; }
    .exp-bar-fill { background: linear-gradient(90deg, #00b894, #55efc4); height: 100%; transition: width 0.6s cubic-bezier(0.17, 0.67, 0.83, 0.67); }
    .confetti-piece { position: fixed; width: 10px; height: 10px; top: -10px; z-index: 9999; animation: fall linear forwards; border-radius: 2px; }
    @keyframes fall { to { transform: translateY(110vh) rotate(720deg); } }
    .menu-item.dragging { opacity: 0.4; border: 2px dashed #00b894 !important; transform: scale(0.95); }

    /* ===== PIGGY SKIN ===== */
    .piggy-skin-box {
        position: relative;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        width: 80px; height: 80px; border-radius: 50%;
        margin: 0 auto 8px auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        transition: background 0.5s;
    }
    .piggy-skin-emoji { font-size: 36px; line-height: 1; }
    .piggy-skin-label { font-size: 10px; font-weight: bold; color: white; text-shadow: 0 1px 3px rgba(0,0,0,0.4); margin-top: 2px; }

    /* สกิน 1-100: โตขึ้น */
    @keyframes grow { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
    .piggy-effect-grow { animation: grow 2s ease-in-out infinite; box-shadow: 0 6px 20px rgba(0,184,148,0.4); }

    /* สกิน 101-200: กระพริบ */
    @keyframes shine { 0%,100% { box-shadow: 0 6px 20px rgba(232,67,147,0.4); } 50% { box-shadow: 0 6px 35px rgba(232,67,147,0.9), 0 0 20px rgba(255,200,220,0.6); } }
    .piggy-effect-shine { animation: shine 1.5s ease-in-out infinite; }

    /* สกิน 200: มงกุฎลอย */
    .piggy-crown { position: absolute; top: -18px; font-size: 28px; animation: crownFloat 2s ease-in-out infinite; }
    @keyframes crownFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes crownGlow { 0%,100% { box-shadow: 0 6px 20px rgba(108,92,231,0.4); } 50% { box-shadow: 0 6px 35px rgba(108,92,231,0.9), 0 0 25px rgba(200,180,255,0.6); } }
    .piggy-effect-crown { animation: crownGlow 2s ease-in-out infinite; }

    /* สกิน MAX: ดาวระยิบระยับ + สั่น */
    .piggy-star { position: absolute; font-size: 20px; animation: starFloat 1.8s ease-in-out infinite; }
    .piggy-star-1 { top: 5px; left: 5px; animation-delay: 0s; }
    .piggy-star-2 { top: 5px; right: 5px; animation-delay: 0.6s; }
    .piggy-star-3 { bottom: 10px; left: 50%; transform: translateX(-50%); animation-delay: 1.2s; }
    @keyframes starFloat { 0%,100% { transform: scale(1) rotate(0deg); opacity: 1; } 50% { transform: scale(1.4) rotate(20deg); opacity: 0.7; } }
    .piggy-star-3 { animation: starFloat3 1.8s ease-in-out infinite 1.2s; }
    @keyframes starFloat3 { 0%,100% { transform: translateX(-50%) scale(1); opacity: 1; } 50% { transform: translateX(-50%) scale(1.4); opacity: 0.7; } }
    @keyframes maxShake { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-3deg); } 75% { transform: rotate(3deg); } }
    @keyframes maxGlow { 0%,100% { box-shadow: 0 6px 20px rgba(240,147,43,0.5); } 50% { box-shadow: 0 6px 40px rgba(249,202,36,1), 0 0 30px rgba(255,230,100,0.8); } }

    /* ===== SAVING JARS ANIMATIONS ===== */
    @keyframes jarPopIn { from{opacity:0;transform:scale(0.75) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }
    @keyframes celebShake { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
    /* ===== PIGGY CELEBRATION OVERLAY ===== */
    #piggy-celebrate {
        position: fixed; inset: 0; z-index: 9998;
        background: rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center;
        animation: fadeInOverlay 0.3s ease;
    }
    @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
    .piggy-celebrate-box {
        background: linear-gradient(135deg, #f9ca24, #f0932b);
        border-radius: 30px;
        padding: 40px 50px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        animation: popIn 0.4s cubic-bezier(0.17, 0.67, 0.83, 0.67);
    }
    @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    .piggy-celebrate-emoji { font-size: 80px; animation: celebShake 0.3s ease-in-out infinite; }
    @keyframes celebShake { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
    .piggy-celebrate-text { font-size: 28px; font-weight: bold; color: white; text-shadow: 0 2px 6px rgba(0,0,0,0.3); margin-top: 10px; }
    .piggy-celebrate-sub { font-size: 16px; color: rgba(255,255,255,0.85); margin-top: 6px; }
`;
document.head.appendChild(style);
// ===== โหลดธีมตอนเปิดแอพ =====
if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
}
render();

// 1. กดปุ่มตัวเลขเพื่อเตรียมฝาก
function prepareDeposit(amount) {
    pendingDeposit += amount;
    render();
}

// 2. กดยกเลิกยอดที่กดผิด
function resetPending() {
    pendingDeposit = 0;
    render();
}

// 3. กดยืนยันเพื่อเอาเงินเข้าหมูและเช็คว่าครบ 300 หรือยัง
function confirmDeposit() {
    if (pendingDeposit <= 0) return;
    piggyBank += pendingDeposit;
    pendingDeposit = 0;

    if (piggyBank >= 300) {
        // แสดงเอฟเฟคฉลองก่อน แล้วค่อยขีดช่อง
        localStorage.setItem("way_piggy", JSON.stringify(piggyBank));
        save();
        render();
        triggerPiggyCelebration(() => {
            while (piggyBank >= 300) {
                piggyBank -= 300;
                const emptyIndex = data.findIndex(v => v < 5);
                if (emptyIndex !== -1) {
                    data[emptyIndex]++;
                    lastTallyDate = getToday();
                    history.push({ index: emptyIndex, date: getToday(), fromPiggy: true });
                }
            }
            localStorage.setItem("way_piggy", JSON.stringify(piggyBank));
            save();
            render();
        });
    } else {
        localStorage.setItem("way_piggy", JSON.stringify(piggyBank));
        save();
        render();
    }
}

function triggerPiggyCelebration(callback) {
    // สร้าง overlay ฉลอง
    const overlay = document.createElement("div");
    overlay.id = "piggy-celebrate";
    overlay.innerHTML = `
        <div class="piggy-celebrate-box">
            <div class="piggy-celebrate-emoji">🐷</div>
            <div class="piggy-celebrate-text">ครบ 300 แล้ว!</div>
            <div class="piggy-celebrate-sub">กำลังขีดช่อง...</div>
        </div>
    `;
    document.body.appendChild(overlay);
    triggerConfetti();
    setTimeout(() => {
        overlay.remove();
        callback();
    }, 2200);
}

/* ===== ACHIEVEMENTS PAGE ===== */
function renderAchievementsPage() {
    const bBtn = document.createElement("button"); bBtn.className = "back-btn"; bBtn.innerText = "🏠";
    bBtn.onclick = () => { settingsOpen = false; currentPage = "home"; render(); };
    const drawer = makeDrawer();
    drawer.appendChild(themeBtn);
    drawer.appendChild(zoomBtn);
    
    app.appendChild(bBtn);
    app.appendChild(settingsBtn);
    app.appendChild(drawer);

    const title = document.createElement("h1");
    title.innerText = "🏆 Achievements";
    app.appendChild(title);
    
    // 🗑️ ลบ pointsDiv - ไม่มีระบบ titanPoints อีกต่อไป

    const container = document.createElement("div");
    container.className = "achievements-container";

    // แบ่งข้อมูล badges ตามหมวด
    const categories = {};
    BADGE_LIST.forEach(badge => {
        if (!categories[badge.category]) categories[badge.category] = [];
        categories[badge.category].push(badge);
    });

    const categoryNames = {
        saving: "💎 Saving Jars",
        tracker: "📅 Tracker",
        expense: "💰 Expense",
        pomodoro: "🍅 Pomodoro",
        goals: "🎯 Goals",
        level: "⭐ Level Up",
        notes: "📝 Notes",
        hidden: "🔒 Hidden"
    };

    Object.keys(categories).forEach(catKey => {
        const section = document.createElement("div");
        section.className = "achievement-section";
        
        const sectionTitle = document.createElement("h3");
        sectionTitle.className = "section-title";
        sectionTitle.innerText = categoryNames[catKey] || catKey;
        section.appendChild(sectionTitle);

        const badgesGrid = document.createElement("div");
        badgesGrid.className = "badges-grid";

        categories[catKey].forEach(badge => {
            const isUnlocked = unlockedBadges.includes(badge.id);
            const badgeCard = document.createElement("div");
            badgeCard.className = `badge-card ${isUnlocked ? "unlocked" : "locked"}`;
            
            badgeCard.innerHTML = `
                <div class="badge-emoji">${badge.emoji}</div>
                <div class="badge-name">${badge.name}</div>
                <div class="badge-desc">${badge.desc}</div>
                <div class="badge-status">${isUnlocked ? "✅ Unlocked" : "🔒 Locked"}</div>
            `;
            
            badgesGrid.appendChild(badgeCard);
        });

        section.appendChild(badgesGrid);
        container.appendChild(section);
    });

    app.appendChild(container);
}

function renderSummaryPage() {
    app.innerHTML = "";
    const bBtn = document.createElement("button");
    bBtn.className = "back-btn"; bBtn.innerText = "🏠";
    bBtn.onclick = () => { currentPage = "home"; render(); };
    const drawer = makeDrawer();
    drawer.appendChild(themeBtn); drawer.appendChild(zoomBtn); 
    app.appendChild(bBtn); app.appendChild(settingsBtn); app.appendChild(drawer);

    const container = document.createElement("div");
    container.className = "goals-page";

    // ===== SAVING JARS (ใหม่) =====
    let totalSavings = 0;
    savingJars.forEach(jar => {
        totalSavings += (jar.saved || 0);
    });

    // สร้าง HTML สำหรับแต่ละกระปุก
    let jarHTML = `<div class="sum-title">🏺 Saving Jars</div>`;
    savingJars.forEach(jar => {
        jarHTML += `<div class="sum-row"><span>${jar.emoji} ${jar.name}</span><span class="sum-val" style="color:#00b894">${(jar.saved || 0).toLocaleString()} ฿</span></div>`;
    });
    jarHTML += `<div class="sum-row" style="border-top:1px solid rgba(255,255,255,0.2); padding-top:8px; margin-top:8px;"><span style="font-weight:bold;">💰 รวมทั้งหมด</span><span class="sum-val" style="color:#00b894; font-weight:bold;">${totalSavings.toLocaleString()} ฿</span></div>`;

// ===== EXPENSE / INCOME SUMMARY =====
const now = new Date();
const todayStr = getToday();

// ✅ เริ่มสัปดาห์แบบ จันทร์-อาทิตย์
const weekStart = new Date(now);
const day = weekStart.getDay(); // อาทิตย์ = 0, จันทร์ = 1
const diffToMonday = day === 0 ? -6 : 1 - day;
weekStart.setDate(weekStart.getDate() + diffToMonday);
weekStart.setHours(0, 0, 0, 0);

// ✅ เริ่มเดือน วันที่ 1
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
monthStart.setHours(0, 0, 0, 0);

let todayIn = 0;
let todayOut = 0;
let weekOut = 0;
let monthIn = 0;
let monthOut = 0;

// ✅ ใช้ archive เป็นหลัก เพื่อไม่ให้ยอดซ้ำกับ myExpenses
myExpenseArchive.forEach(a => {
    const d = new Date(a.date || todayStr);
    d.setHours(0, 0, 0, 0);

    const totalIn = Number(a.totalIn || 0);
    const totalOut = Number(a.totalOut || 0);

    // วันนี้
    if (a.date === todayStr) {
        todayIn += totalIn;
        todayOut += totalOut;
    }

    // สัปดาห์นี้
    if (d >= weekStart) {
        weekOut += totalOut;
    }

    // เดือนนี้
    if (d >= monthStart) {
        monthIn += totalIn;
        monthOut += totalOut;
    }
});
    // ===== GOALS =====
    const dailyTotal = myDailyGoals.length;
    const dailyDone = myDailyGoals.filter(g => g.done).length;
    const dailyPct = dailyTotal > 0 ? Math.floor((dailyDone/dailyTotal)*100) : 0;
    const longTotal = myLongTermGoals.length;
    const longDone = myLongTermGoals.filter(g => g.done).length;
    const longPct = longTotal > 0 ? Math.floor((longDone/longTotal)*100) : 0;

    // ===== POMODORO =====
    const pomoCount = parseInt(localStorage.getItem("pomoCount") || "0");
    const pomoFocusMinutes = parseInt(localStorage.getItem("pomoFocusMinutes") || "0");

    container.innerHTML = `
        <h1 style="margin-top:100px;">📊 Summary</h1>

        <div class="summary-section-card">
            ${jarHTML}
        </div>

        <div class="summary-section-card">
    <div class="sum-title">💰 Income / Expense</div>
    <div class="sum-row"><span>💵 วันนี้รับ</span><span class="sum-val" style="color:#00b894">${todayIn.toLocaleString()} ฿</span></div>
    <div class="sum-row"><span>💸 วันนี้จ่าย</span><span class="sum-val" style="color:#ff7675">${todayOut.toLocaleString()} ฿</span></div>
    <div class="sum-row"><span>📆 สัปดาห์นี้จ่าย</span><span class="sum-val" style="color:#ff7675">${weekOut.toLocaleString()} ฿</span></div>
    <div class="sum-row"><span>💰 เดือนนี้รับ</span><span class="sum-val" style="color:#00b894">${monthIn.toLocaleString()} ฿</span></div>
    <div class="sum-row"><span>🗓️ เดือนนี้จ่าย</span><span class="sum-val" style="color:#ff7675">${monthOut.toLocaleString()} ฿</span></div>
</div>

        <div class="summary-section-card">
            <div class="sum-title">🎯 Goals</div>
            <div class="sum-row"><span>📋 Daily Goals</span><span class="sum-val">${dailyDone}/${dailyTotal} (${dailyPct}%)</span></div>
            <div class="sum-row"><span>⏳ ค้างอยู่</span><span class="sum-val" style="color:#fdcb6e">${dailyTotal - dailyDone} รายการ</span></div>
            <div class="sum-row"><span>🏆 Long-term</span><span class="sum-val">${longDone}/${longTotal} (${longPct}%)</span></div>
        </div>

        <div class="summary-section-card">
            <div class="sum-title">🍅 Pomodoro</div>
            <div class="sum-row"><span>⏱️ รวม Session</span><span class="sum-val">${pomoCount} รอบ</span></div>
            <div class="sum-row"><span>🕐 เวลา Focus รวม</span><span class="sum-val">${pomoFocusMinutes} นาที</span></div>
        </div>
    `;
    app.appendChild(container);
}
/* === ส่วนที่ 1: ฟังก์ชันจัดการ Modal (วางท้ายไฟล์ script.js) === */

// ฟังก์ชันเปิดหน้าต่างโน้ต
// --- วางโค้ดนี้ท้ายสุดของไฟล์ script.js ---

window.openNoteViewPage = async (id) => {
    const note = myNotes.find(n => n.id === id);
    if (!note) return;

    if (note.password && !unlockedNotes.includes(note.id)) {
        const input = prompt("ใส่รหัสผ่านเพื่อเข้าถึงโน้ต:");
        if (input === null) return;
        const hashed = await hashPassword(input);
        if (hashed !== note.password) {
            alert("รหัสไม่ถูกต้อง!");
            return;
        }
        unlockedNotes.push(note.id);
    }

    app.innerHTML = "";
    
    const categoryColor = {
        personal: "#ffd93d",
        work: "#ff6b6b",
        other: "#6bcf7f"
    }[note.category] || "#6bcf7f";
    
    const header = document.createElement("div");
    header.className = "notes-header";
    header.innerHTML = `<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;"><button class="back-btn" onclick="goNotesFromView()">⬅️</button><h1 style="margin: 0; font-size: 28px; font-weight: 700; flex: 1; text-align: center;">แก้ไข Note</h1><div style="width: 60px;"></div></div>`;
    app.appendChild(header);
    
    const viewContainer = document.createElement("div");
    viewContainer.className = "notes-view-page-container";
    viewContainer.innerHTML = `
        <div class="notes-view-form">
            <div class="form-group">
                <label>หัวข้อ</label>
                <input type="text" id="note-view-title" class="form-input" value="${note.title}" placeholder="หัวข้อ...">
                <div class="note-view-category-badge" style="border-left-color: ${categoryColor}; margin-top: 8px;">
                    ${note.category === 'personal' ? '👤 ส่วนตัว' : note.category === 'work' ? '💼 งาน' : '✨ อื่นๆ'}
                    ${note.password ? ' 🔒' : ''}
                </div>
            </div>
            
            <div class="form-group">
                <label>เนื้อหา</label>
                <textarea id="note-view-body" class="form-textarea" style="min-height: 400px; resize: vertical;" placeholder="เขียนเนื้อหา...">${note.body}</textarea>
            </div>
            
            <div class="form-group">
                <label style="font-size: 12px; color: rgba(255,255,255,0.6);">📅 แก้ไขล่าสุด: ${note.date}</label>
            </div>
            
            <div class="notes-view-buttons">
                <button class="btn-delete" onclick="handleNoteDeleteFromView(${myNotes.indexOf(note)})">🗑️ ลบโน้ต</button>
                <button class="btn-cancel" onclick="goNotesFromView()">ยกเลิก</button>
                <button class="btn-primary" onclick="saveNoteFromView(${id})">💾 บันทึก</button>
            </div>
        </div>
    `;
    app.appendChild(viewContainer);
};

window.goNotesFromView = () => {
    notesCurrentFilter = "all";
    renderNotesPageNew();
};

window.handleNoteDeleteFromView = (index) => {
    if (confirm("ต้องการลบโน้ตนี้หรือไม่?")) {
        myNotes.splice(index, 1);
        save();
        goNotesFromView();
    }
};

window.saveNoteFromView = (id) => {
    const newTitle = document.getElementById("note-view-title").value.trim();
    const newBody = document.getElementById("note-view-body").value.trim();
    const idx = myNotes.findIndex(n => n.id === id);
    
    if (idx !== -1) {
        myNotes[idx].title = newTitle || "ไม่มีชื่อ";
        myNotes[idx].body = newBody;
        myNotes[idx].date = new Date().toLocaleString('th-TH');
        save();
        goNotesFromView();
    }
};

// 🔴 เก่า - modal version (ลบแล้ว):
window.openNoteModal = async (id) => {
    // ⚠️ Function นี้ถูกแทนที่ด้วย openNoteViewPage แล้ว
    openNoteViewPage(id);
};
// ฟังก์ชันสำหรับเปลี่ยนสีโน้ต
window.updateNoteColor = (id, color) => {
    // เปลี่ยนสีในหน้าต่าง Popup ทันที
    const content = document.querySelector('.note-edit-modal-content');
    if (content) content.style.background = color;
    
    // บันทึกสีลงในข้อมูลโน้ต
    const idx = myNotes.findIndex(n => n.id === id);
    if (idx !== -1) {
        myNotes[idx].bgColor = color;
    }
};

function showCalcToolsModal() {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:10000; padding:20px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);";
    
    overlay.innerHTML = `
        <div style="background:#141414; border:2px solid #00d2ff; border-radius:26px; padding:35px 24px; width:100%; max-width:320px; text-align:center; box-shadow:0 20px 50px rgba(0,210,255,0.25); animation: pageFade 0.25s ease-out; box-sizing:border-box;">
            <div style="font-size:50px; margin-bottom:12px; filter: drop-shadow(0 0 10px rgba(0,210,255,0.5));">🧮</div>
            <h2 style="margin:0 0 6px; font-size:22px; color:white; font-family:inherit; font-weight:bold; letter-spacing:0.5px;">Calculator Tools</h2>
            <p style="margin:0 0 28px; font-size:13px; color:#aaa; font-family:inherit;">เลือกเครื่องมือคำนวณที่ต้องการ</p>
            
            <div style="display:flex; flex-direction:column; gap:14px; width:100%;">
                <button id="btn-choice-standard" style="padding:16px; border-radius:16px; border:none; background:#00d2ff; color:black; font-size:15px; font-weight:bold; cursor:pointer; font-family:inherit; box-shadow: 0 4px 15px rgba(0,210,255,0.3); transition: all 0.1s ease; outline:none;">
                    🧮 Standard Calculator
                </button>
                
                <button id="btn-choice-tvm" style="padding:16px; border-radius:16px; border: none; background: #e74c3c; color: white; font-size:15px; font-weight:bold; cursor:pointer; font-family:inherit; transition: all 0.1s ease; box-shadow: 0 2px 10px rgba(0,210,255,0.1); outline:none;">
                    📈 TVM Calculator
                </button>
                
                <button id="btn-choice-close" style="padding:10px; border-radius:14px; border:none; background:transparent; color:#666; font-size:13px; cursor:pointer; font-family:inherit; margin-top:8px; text-decoration:underline; transition: color 0.2s;">
                    ปิดหน้าต่าง
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // ดักฟังการคลิกปุ่มย่อยในหน้าเลือก
    overlay.querySelector("#btn-choice-standard").onclick = () => {
        overlay.remove();
        openStandardCalculator(); // วิ่งไปเบิกเครื่องคิดเลขแผงใหญ่ของคุณขึ้นจอ
    };
    overlay.querySelector("#btn-choice-tvm").onclick = () => {
        overlay.remove();
        currentPage = "tvm"; // เปลี่ยนหน้าแอปหลักไปที่หน้าทีวีเอ็มดั้งเดิม
        render(); // สั่งวาดหน้าใหม่
    };
    overlay.querySelector("#btn-choice-close").onclick = () => overlay.remove();
}

// 2. หน้าต่างเครื่องคิดเลขแผงใหญ่ (โค้ดดั้งเดิมที่คุณฝากไว้ ครบถ้วนร้อยเปอร์เซ็นต์)
function openStandardCalculator() {
    const overlay = document.createElement("div");
    overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.92); z-index:10005; display:flex; align-items:center; justify-content:center; font-family:sans-serif; touch-action:none;";
    
    const calc = document.createElement("div");
    calc.style = "background:#111; padding:30px; border-radius:30px; border:3px solid #00d2ff; width:350px; box-shadow: 0 0 40px #00d2ff77;";
    
    const display = document.createElement("div");
    display.id = "calc-display";
    display.style = "background:#000; color:#00d2ff; padding:25px; text-align:right; font-size:42px; font-weight:bold; border-radius:20px; margin-bottom:25px; min-height:60px; border:2px solid #333; overflow:hidden; word-break:break-all;";
    display.innerText = "0";
    calc.appendChild(display);

    const buttons = [
        'C', 'DEL', 'X', '/',
        '7', '8', '9', '*',
        '4', '5', '6', '-',
        '1', '2', '3', '+',
        '0', '.', '='
    ];

    const grid = document.createElement("div");
    grid.style = "display:grid; grid-template-columns: repeat(4, 1fr); gap:15px;";

    buttons.forEach(btn => {
        const b = document.createElement("button");
        b.innerText = (btn === 'X') ? '✕' : btn;
        b.style = "padding:25px 10px; border-radius:18px; border:none; background:#222; color:white; font-size:24px; font-weight:bold; cursor:pointer;";
        
        if (btn === '=') { b.style.background = "#00d2ff"; b.style.color="#000"; b.style.gridColumn = "span 2"; }
        if (btn === 'X') { b.style.background = "#ff4d4d"; }
        if (['/', '*', '-', '+'].includes(btn)) { b.style.color = "#f1c40f"; b.style.background = "#2a2a2a"; }

        b.onclick = () => {
            const d = document.getElementById("calc-display");
            if (btn === '✕' || btn === 'X') { document.body.removeChild(overlay); }
            else if (btn === 'C') { d.innerText = "0"; }
            else if (btn === 'DEL') { d.innerText = d.innerText.slice(0, -1) || "0"; }
            else if (btn === '=') { 
                try { 
                    let result = eval(d.innerText);
                    d.innerText = Number(result.toFixed(8)).toString(); 
                } catch { d.innerText = "Error"; }
            } else {
                if (d.innerText === "0" && btn !== '.') d.innerText = btn;
                else d.innerText += btn;
            }
        };
        grid.appendChild(b);
    });

    calc.appendChild(grid);
    overlay.appendChild(calc);
    document.body.appendChild(overlay);
}

// 🗑️ ลบ renderShopPage, buyItem, adminAddPoints - ไม่มีระบบ shop อีกต่อไป

/* ===== SAVINGS PAGE ===== */
function renderSavingsPage() {
    app.innerHTML = "";
    const bBtn = document.createElement("button"); 
    bBtn.className = "back-btn"; bBtn.innerText = "🏠";
    bBtn.onclick = () => { currentPage = "home"; render(); };
    app.appendChild(bBtn);
    const drawer = makeDrawer();
    drawer.appendChild(themeBtn); drawer.appendChild(zoomBtn); 
    app.appendChild(settingsBtn); app.appendChild(drawer);

    const container = document.createElement("div"); 
    container.className = "goals-page";
    container.innerHTML = `
        <h1>💰 ออมสิน</h1>
        <div style="text-align:center; color:#888; margin-top:20px; padding:20px;">
            <p>ระบบออมสินของคุณจะแสดงที่นี่</p>
            <p style="font-size:12px;">รวมจำนวนเงินทั้งหมดจากทุกกระปุก</p>
        </div>
    `;
    app.appendChild(container);
}


// 🗑️ ลบ toggleEquip - ระบบสกินถูกลบแล้ว
/* ===== TOGGLE SPECIAL BUTTONS ===== */
function toggleSpecialButtons() {
    const settingsBtn = document.querySelector(".settings-btn");
    const zoomBtns = document.querySelectorAll(".zoom-btn");
    const themeBtn = document.querySelector(".theme-btn");
    const drawer = document.querySelector(".settings-drawer");
    
    if (specialButtonsVisible) {
        if (settingsBtn) settingsBtn.style.display = "block";
        if (themeBtn) themeBtn.style.display = "block";
        zoomBtns.forEach(btn => btn.style.display = "block");
        if (drawer) drawer.style.display = "block";
    } else {
        if (settingsBtn) settingsBtn.style.display = "none";
        if (themeBtn) themeBtn.style.display = "none";
        zoomBtns.forEach(btn => btn.style.display = "none");
        if (drawer) drawer.style.display = "none";
    }
}

/* ===== SETTINGS PAGE ===== */
function renderSettingsPage() {
    const settingsContainer = document.createElement("div");
    settingsContainer.className = "settings-page";
    settingsContainer.style.cssText = "padding-top: 10px; padding-bottom: 100px;";
    
    const themes = ["dark", "matrix", "cyberpunk", "midnight", "autumn", "sakura"];
    const currentTheme = localStorage.getItem("theme") || "dark";
    const themeNames = { 
        dark: "Dark", 
        matrix: "Matrix", 
        cyberpunk: "Cyber", 
        midnight: "Midnight", 
        autumn: "Autumn", 
        sakura: "Sakura"
    };
    
    const settingsHTML = `
        <div style="padding: 0; max-width: 100%;">
            <div style="padding: 1.5rem 1.25rem; display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <button style="width: 40px; height: 40px; border: none; border-radius: 50%; background: rgba(255,255,255,0.15); cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center;" id="back-to-home">←</button>
                <h1 style="font-size: 28px; font-weight: 600; margin: 0;">การตั้งค่า</h1>
            </div>

            <div style="margin-top: 1.5rem;">
                <h3 style="font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); margin: 1rem 1.25rem 0.75rem; text-transform: uppercase; letter-spacing: 1.5px;">ทั่วไป</h3>
                <div style="background: rgba(255,255,255,0.08); margin: 0 0.75rem; border-radius: 14px; overflow: hidden;">
                    ${(() => {
                        const googleUser = JSON.parse(localStorage.getItem("googleUser") || "null");
                        if (googleUser) {
                            // ถ้า login แล้ว แสดงข้อมูล user
                            return `
                                <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                                        <img src="${googleUser.picture}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover;" />
                                        <div>
                                            <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">${googleUser.name}</p>
                                            <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">${googleUser.email}</p>
                                        </div>
                                    </div>
                                    <button style="padding: 0.5rem 1rem; background: rgba(255,255,255,0.15); color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer;" id="google-logout-btn">ออก</button>
                                </div>
                            `;
                        } else {
                            // ถ้าไม่ login แสดงปุ่ม Sign in
                            return `
                                <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                                    <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
                                        <svg style="width: 44px; height: 44px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                        </svg>
                                        <div>
                                            <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">Google Account</p>
                                            <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">ล็อกอินด้วย Google</p>
                                        </div>
                                    </div>
                                    <button style="padding: 0.5rem 1.2rem; background: white; color: #1f2937; border: 1px solid #d1d5db; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer;" id="google-login-btn">Sign in</button>
                                </div>
                            `;
                        }
                    })()}
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" id="theme-item">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #ff6b6b, #ee5a6f); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; color: white;">🎨</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">ธีม</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;" id="theme-display">${themeNames[currentTheme]}</p>
                            </div>
                        </div>
                        <div style="font-size: 20px; color: rgba(255,255,255,0.5);">→</div>
                    </div>
                    <div style="padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #4facfe, #00f2fe); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">⭐</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">ปุ่มพิเศษ</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">Zoom, Theme, Cloud</p>
                            </div>
                        </div>
                        <div style="width: 50px; height: 30px; background: ${specialButtonsVisible ? '#4caf50' : '#555'}; border-radius: 15px; position: relative; cursor: pointer; transition: background 0.3s;" id="special-btn-toggle">
                            <div style="position: absolute; width: 26px; height: 26px; background: white; border-radius: 50%; top: 2px; ${specialButtonsVisible ? 'right: 2px' : 'left: 2px'}; transition: all 0.3s;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div style="margin-top: 2rem;">
                <h3 style="font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); margin: 1rem 1.25rem 0.75rem; text-transform: uppercase; letter-spacing: 1.5px;">สำรองข้อมูล</h3>
                <div style="background: rgba(255,255,255,0.08); margin: 0 0.75rem; border-radius: 14px; overflow: hidden;">
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">☁️</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">สำรองข้อมูล</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">บันทึกลงคลาว</p>
                            </div>
                        </div>
                        <button style="padding: 0.5rem 1.2rem; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer;" id="backup-btn">สำรอง</button>
                    </div>
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #f093fb, #f5576c); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">↩️</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">กู้คืนข้อมูล</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">คืนข้อมูลเก่า</p>
                            </div>
                        </div>
                        <button style="padding: 0.5rem 1.2rem; background: linear-gradient(135deg, #f093fb, #f5576c); color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer;" id="restore-btn">กู้คืนข้อมูล</button>
                    </div>
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #fa709a, #fee140); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">🗑️</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">ล้างข้อมูล</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">ลบทั้งหมด</p>
                            </div>
                        </div>
                        <button style="padding: 0.5rem 1.2rem; background: linear-gradient(135deg, #fa709a, #fee140); color: #333; border: none; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer;" id="clear-all-btn">ล้าง</button>
                    </div>
                </div>
            </div>

            <div style="margin-top: 2rem;">
                <h3 style="font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); margin: 1rem 1.25rem 0.75rem; text-transform: uppercase; letter-spacing: 1.5px;">เสียงและการแจ้งเตือน</h3>
                <div style="background: rgba(255,255,255,0.08); margin: 0 0.75rem; border-radius: 14px; overflow: hidden;">
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #a8edea, #fed6e3); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">🔔</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">Push Notification</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">เปิดการแจ้งเตือนแบบ Push</p>
                            </div>
                        </div>
                        <button id="enable-notification-btn" style="padding: 0.5rem 1.2rem; background: linear-gradient(135deg, #a8edea, #fed6e3); color: #333; border: none; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.3s; font-family: inherit;" onclick="requestNotificationPermission()">เปิด</button>
                    </div>
                    <div style="padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #ffa751, #ffe259); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">🎵</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">เสียงเป้าหมาย & ความสำเร็จ</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">เปิดเสียประกอบ</p>
                            </div>
                        </div>
                        <div style="width: 50px; height: 30px; background: #555; border-radius: 15px; position: relative; cursor: pointer;">
                            <div style="position: absolute; width: 26px; height: 26px; background: white; border-radius: 50%; top: 2px; left: 2px;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div style="margin-top: 2rem; margin-bottom: 2rem;">
                <h3 style="font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); margin: 1rem 1.25rem 0.75rem; text-transform: uppercase; letter-spacing: 1.5px;">เกี่ยวกับ</h3>
                <div style="background: rgba(255,255,255,0.08); margin: 0 0.75rem; border-radius: 14px; overflow: hidden;">
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #4facfe, #00f2fe); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">🔐</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">นโยบายความปลอดภัย</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">อ่านเพิ่มเติม</p>
                            </div>
                        </div>
                        <div style="font-size: 20px; color: rgba(255,255,255,0.5);">→</div>
                    </div>
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #43e97b, #38f9d7); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">💡</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">คำแนะนำ</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;"></p>
                            </div>
                        </div>
                        <div style="font-size: 20px; color: rgba(255,255,255,0.5);">→</div>
                    </div>
                    <div style="padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px;">ℹ️</div>
                            <div>
                                <p style="font-size: 15px; font-weight: 500; margin: 0; color: white;">เวอร์ชัน</p>
                                <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0 0;">v1.0.5</p>
                            </div>
                        </div>
                        <div style="font-size: 16px; color: rgba(255,255,255,0.5); font-weight: 600;">v1.0.5</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    settingsContainer.innerHTML = settingsHTML;
    app.appendChild(settingsContainer);
    
    setTimeout(() => {
        const backBtn = document.getElementById("back-to-home");
        const themeItem = document.getElementById("theme-item");
        const specialToggle = document.getElementById("special-btn-toggle");
        const backupBtn = document.getElementById("backup-btn");
        const restoreBtn = document.getElementById("restore-btn");
        const clearAllBtn = document.getElementById("clear-all-btn");
        const googleLoginBtn = document.getElementById("google-login-btn");
        const googleLogoutBtn = document.getElementById("google-logout-btn");

        if (backBtn) {
            backBtn.onclick = () => {
                currentPage = "home";
                render();
            };
        }

        if (googleLoginBtn) {
            googleLoginBtn.onclick = () => {
                initializeGoogleLogin();
                google.accounts.id.renderButton(
                    googleLoginBtn.parentElement,
                    { theme: "outline", size: "large", width: "250" }
                );
            };
        }

        if (googleLogoutBtn) {
            googleLogoutBtn.onclick = () => {
                logout();
            };
        }

        if (themeItem) {
            themeItem.onclick = () => {
                const current = localStorage.getItem("theme") || "dark";
                const next = themes[(themes.indexOf(current) + 1) % themes.length];
                
                document.body.classList.remove("dark-mode", "matrix-mode", "cyberpunk-mode", "midnight-mode", "autumn-mode", "sakura-mode");
                if (next === "dark") document.body.classList.add("dark-mode");
                if (next === "matrix") document.body.classList.add("matrix-mode");
                if (next === "cyberpunk") document.body.classList.add("cyberpunk-mode");
                if (next === "midnight") document.body.classList.add("midnight-mode");
                if (next === "autumn") document.body.classList.add("autumn-mode");
                if (next === "sakura") document.body.classList.add("sakura-mode");
                localStorage.setItem("theme", next);
                
                document.getElementById("theme-display").innerText = themeNames[next];
            };
        }

        if (specialToggle) {
            specialToggle.onclick = () => {
                specialButtonsVisible = !specialButtonsVisible;
                localStorage.setItem("specialButtonsVisible", specialButtonsVisible);
                const dot = specialToggle.querySelector("div");
                specialToggle.style.background = specialButtonsVisible ? '#4caf50' : '#555';
                dot.style.right = specialButtonsVisible ? '2px' : 'auto';
                dot.style.left = specialButtonsVisible ? 'auto' : '2px';
                
                const settingsBtn = document.querySelector(".settings-btn");
                const zoomBtns = document.querySelectorAll(".zoom-btn");
                const themeBtn = document.querySelector(".theme-btn");
                const drawer = document.querySelector(".settings-drawer");
                
                if (settingsBtn) settingsBtn.style.display = specialButtonsVisible ? "block" : "none";
                if (themeBtn) themeBtn.style.display = specialButtonsVisible ? "block" : "none";
                zoomBtns.forEach(btn => btn.style.display = specialButtonsVisible ? "block" : "none");
                if (drawer) drawer.style.display = specialButtonsVisible ? "block" : "none";
            };
        }

        if (backupBtn) {
            backupBtn.onclick = async () => {
                await backupToGoogleDrive();
            };
        }

        if (restoreBtn) {
            restoreBtn.onclick = async () => {
                await restoreFromGoogleDrive();
            };
        }

        if (clearAllBtn) {
            clearAllBtn.onclick = () => {
                const choice = confirm("⚠️ คำเตือน!\nการล้างข้อมูลจะลบทุกอย่างให้เหมือนตอนติดตั้งแอปใหม่\nต้องการดำเนินการต่อไปหรือไม่?");
                if (choice) {
                    // 1. เคลียร์ข้อมูลพังๆ ออกให้หมด
                    localStorage.clear();
                    sessionStorage.clear();

                    // 2. เซ็ตค่าพื้นฐานตัวเลขป้องกัน NaN / ตัวหนังสือป้องกัน null split
                    localStorage.setItem("user_level", "1");
                    localStorage.setItem("user_exp", "0");
                    // 🗑️ ลบ titan_points - ระบบ shop ถูกลบแล้ว
                    localStorage.setItem("user_theme", "default");
                    
                    const todayStr = new Date().toISOString().split("T")[0];
                    localStorage.setItem("last_login_date", todayStr);
                    localStorage.setItem("last_routine_reset", todayStr);

                    // 3. เซ็ตค่า Array ว่าง ป้องกันตระกูล .forEach / .map / .filter พัง
                    localStorage.setItem("tasks", JSON.stringify([]));
                    localStorage.setItem("notes", JSON.stringify([]));
                    localStorage.setItem("expenses", JSON.stringify([]));
                    localStorage.setItem("saving_jars", JSON.stringify([]));
                    localStorage.setItem("routines", JSON.stringify([]));
                    localStorage.setItem("unlocked_badges", JSON.stringify([]));
                    localStorage.setItem("purchased_items", JSON.stringify([]));

                    // 4. แจ้งเตือนและรีโหลดแอปอย่างปลอดภัย
                    alert("✓ ล้างข้อมูลและตั้งค่าเริ่มต้นสำเร็จ!");
                    window.location.href = window.location.href;
                }
            };
        }

        // Update notification button UI
        updateNotificationButtonUI();
    }, 50);
}
// ฟังก์ชันสำหรับสั่งให้ปุ่มพิเศษทั้งหมด อัปเดตการแสดงผลทันทีตามสวิตช์
function updateSpecialButtonsVisibility() {
    if (settingsBtn) settingsBtn.style.display = specialButtonsVisible ? "block" : "none";
    if (themeBtn) themeBtn.style.display = specialButtonsVisible ? "block" : "none";
    if (typeof zoomBtns !== "undefined") {
        zoomBtns.forEach(btn => btn.style.display = specialButtonsVisible ? "block" : "none");
    }
}// ====== CUSTOM GOOGLE BUTTON + PROFILE PAGE ======

function renderProfilePage() {
    app.innerHTML = ""; 
    const bBtn = document.createElement("button"); 
    bBtn.className = "back-btn"; 
    bBtn.innerText = "🏠";
    bBtn.onclick = () => { currentPage = "home"; render(); };
    
    const drawer = makeDrawer();
    drawer.appendChild(themeBtn); drawer.appendChild(zoomBtn); 
    app.appendChild(bBtn); app.appendChild(settingsBtn); app.appendChild(drawer);

    const container = document.createElement("div"); 
    container.className = "goals-page";
    
    const userProfileData = JSON.parse(localStorage.getItem("userProfile")) || {};
    const userProfileImage = localStorage.getItem("userProfileImage") || null;
    const googleUser = localStorage.getItem("googleUser") ? JSON.parse(localStorage.getItem("googleUser")) : null;
    const isGoogleLogin = !!googleUser;
    
    container.innerHTML = `
        <h1 style="margin-bottom:20px; font-size:18px;">👤 My Profile</h1>
        
        <div style="display:flex; gap:24px; align-items:flex-start; padding:0 10px;">
            <!-- Left: Profile Picture -->
            <div style="flex-shrink:0;">
                <p style="font-size:11px; color:rgba(255,255,255,0.5); margin:0 0 8px 0; text-transform:uppercase; letter-spacing:0.5px;">📸 Picture</p>
                
                <div id="profile-image-container" style="
                    width:140px; height:140px;
                    background:rgba(255,255,255,0.08);
                    border:2px solid rgba(255,255,255,0.15);
                    border-radius:12px;
                    display:flex; align-items:center; justify-content:center;
                    overflow:hidden; flex-shrink:0;
                ">
                    ${googleUser?.picture ? `<img src="${googleUser.picture}" style="width:100%; height:100%; object-fit:cover;">` : (userProfileImage ? `<img src="${userProfileImage}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="font-size:48px;">📷</div>`)}
                </div>
                
                <div style="display:flex; gap:8px; margin-top:10px;">
                    ${!isGoogleLogin ? `
                        <button id="profile-change-btn" style="flex:1; padding:8px; background:rgba(255,140,0,0.2); border:2px solid #ff8c00; border-radius:8px; color:#ff8c00; font-weight:600; font-size:12px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,140,0,0.3)'" onmouseout="this.style.background='rgba(255,140,0,0.2)'">Change</button>
                        <button id="profile-delete-btn" style="flex:1; padding:8px; background:rgba(255,50,50,0.2); border:2px solid #ff3232; border-radius:8px; color:#ff3232; font-weight:600; font-size:12px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,50,50,0.3)'" onmouseout="this.style.background='rgba(255,50,50,0.2)'">Delete</button>
                    ` : `<div style="opacity:0.5; font-size:11px; text-align:center; width:100%; color:rgba(255,165,0,0.8);">🔒 Google</div>`}
                </div>
                
                <input type="file" id="profile-image-input" accept="image/*" style="display:none;">
            </div>
            
            <!-- Right: Username & Google -->
            <div style="flex:1; min-width:0;">
                <!-- Username Section -->
                <div style="margin-bottom:20px;">
                    <p style="font-size:11px; color:rgba(255,255,255,0.5); margin:0 0 8px 0; text-transform:uppercase;">📝 Username</p>
                    ${isGoogleLogin ? `
                        <div style="padding:10px; background:rgba(0,184,148,0.1); border:2px solid rgba(0,184,148,0.4); border-radius:8px; color:#00b894; font-size:13px; font-weight:600; text-align:center;">
                            ${googleUser?.name || 'User'}<br/><span style="font-size:11px; opacity:0.7;">From Google</span>
                        </div>
                    ` : `
                        <input type="text" id="username-input" maxlength="16" placeholder="Enter username" value="${userProfileData.username || ''}" style="width:100%; padding:10px; background:rgba(255,255,255,0.08); border:2px solid rgba(0,184,148,0.4); border-radius:8px; color:white; font-size:13px; outline:none; box-sizing:border-box; font-family:inherit;" onfocus="this.style.borderColor='#00b894'" onblur="this.style.borderColor='rgba(0,184,148,0.4)'">
                        <button id="save-username-btn" style="width:100%; margin-top:8px; padding:10px; background:linear-gradient(135deg, #00b894, #00d2ff); color:white; border:none; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer; transition:transform 0.2s; font-family:inherit;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">✅ Save</button>
                    `}
                </div>
                
                <!-- Google Account Section -->
                <div>
                    <p style="font-size:11px; color:rgba(255,255,255,0.5); margin:0 0 8px 0; text-transform:uppercase;">🔐 Account</p>
                    ${isGoogleLogin ? `
                        <div style="padding:10px; background:rgba(0,184,148,0.1); border:2px solid rgba(0,184,148,0.4); border-radius:8px; text-align:center;">
                            <div style="font-size:12px; color:#00b894; margin-bottom:8px;">✅ Logged in</div>
                            <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-bottom:10px; word-break:break-all;">${googleUser?.email}</div>
                            <button id="profile-google-logout-btn" style="width:100%; padding:8px; background:rgba(255,107,107,0.2); color:#ff6b6b; border:1px solid #ff6b6b; border-radius:8px; font-weight:bold; font-size:12px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,107,107,0.3)'" onmouseout="this.style.background='rgba(255,107,107,0.2)'">🚪 Logout</button>
                        </div>
                    ` : `
                        <button id="profile-google-login-btn" style="
                            width:100%;
                            padding:12px;
                            background:white;
                            color:#1f2937;
                            border:1px solid #d1d5db;
                            border-radius:8px;
                            font-weight:600;
                            font-size:14px;
                            cursor:pointer;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            gap:10px;
                            transition:all 0.2s;
                            font-family:inherit;
                        " onmouseover="this.style.background='#f9fafb'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)'" onmouseout="this.style.background='white'; this.style.boxShadow='none'">
                            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Sign in with Google
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;

    app.appendChild(container);
    setTimeout(() => setupProfilePageEvents(isGoogleLogin, googleUser), 100);
}

function showDeleteProfilePictureModal(onConfirm) {
    // สร้าง overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `;
    
    // สร้าง modal
    const modal = document.createElement("div");
    modal.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 32px 24px;
        max-width: 300px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease-out;
    `;
    
    // เพิ่ม animation ถ้ายังไม่มี
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    if (!document.querySelector("style[data-modal-anim]")) {
        style.setAttribute("data-modal-anim", "true");
        document.head.appendChild(style);
    }
    
    modal.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: white;">ลบรูปโปรไฟล์?</h3>
            <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.6); font-size: 13px;">คุณแน่ใจว่าต้องการลบรูปโปรไฟล์หรือไม่</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="cancel-delete-profile" style="flex: 1; padding: 12px 20px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">ยกเลิก</button>
                <button id="confirm-delete-profile" style="flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #ff6b6b 0%, #ff5252 100%); border: none; border-radius: 10px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);">ลบ</button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Event listeners
    document.getElementById("cancel-delete-profile").onclick = () => {
        overlay.remove();
    };
    
    document.getElementById("confirm-delete-profile").onclick = () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    };
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    };
}

function setupProfilePageEvents(isGoogleLogin, googleUser) {
    const imageInput = document.getElementById("profile-image-input");
    const changeBtn = document.getElementById("profile-change-btn");
    const deleteBtn = document.getElementById("profile-delete-btn");
    const imageContainer = document.getElementById("profile-image-container");
    
    if (changeBtn && !isGoogleLogin) {
        changeBtn.onclick = () => imageInput.click();
    }
    
    if (imageInput && !isGoogleLogin) {
        imageInput.addEventListener("change", (e) => {
            if (e.target.files[0]) {
                startImageCropFromProfile(e.target.files[0]);
            }
        });
        
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                showDeleteProfilePictureModal(() => {
                    localStorage.removeItem("userProfileImage");
                    showNotification("✅ Deleted", "Profile picture removed", "success");
                    render();
                });
            };
        }
        
        if (imageContainer) {
            imageContainer.addEventListener("dragover", (e) => {
                e.preventDefault();
                imageContainer.style.borderColor = "#00b894";
                imageContainer.style.background = "rgba(0,184,148,0.1)";
            });
            imageContainer.addEventListener("dragleave", () => {
                imageContainer.style.borderColor = "rgba(255,255,255,0.15)";
                imageContainer.style.background = "rgba(255,255,255,0.08)";
            });
            imageContainer.addEventListener("drop", (e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]?.type.startsWith("image/")) {
                    startImageCropFromProfile(e.dataTransfer.files[0]);
                }
            });
        }
    }
    
    const saveBtn = document.getElementById("save-username-btn");
    if (saveBtn) {
        saveBtn.onclick = () => {
            const usernameInput = document.getElementById("username-input");
            const username = usernameInput.value.trim();
            if (username.length === 0 || username.length > 16) {
                alert("Username must be 1-16 characters");
                return;
            }
            const userProfile = JSON.parse(localStorage.getItem("userProfile")) || {};
            userProfile.username = username;
            localStorage.setItem("userProfile", JSON.stringify(userProfile));
            showNotification("✅ Saved", `Welcome, ${username}!`, "success");
            render();
        };
    }
    
    // Custom Google Button (ไม่ใช้ Google library)
    const googleLoginBtn = document.getElementById("profile-google-login-btn");
    if (googleLoginBtn && !isGoogleLogin) {
        googleLoginBtn.onclick = () => {
            initializeGoogleLogin();
        };
    }
    
    const logoutBtn = document.getElementById("profile-google-logout-btn");
    if (logoutBtn) {
        logoutBtn.onclick = () => logout();
    }
}

function startImageCropFromProfile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        showImageCropperForProfile(e.target.result, (croppedImage) => {
            localStorage.setItem("userProfileImage", croppedImage);
            showNotification("✅ Saved", "Profile picture updated", "success");
            render();
        });
    };
    reader.readAsDataURL(file);
}

function showImageCropperForProfile(imageSrc, onSuccess) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px;`;
    
    let cropCoords = { x: 0, y: 0, width: 0, height: 0 }; // เก็บพิกัด crop (rectangular)
    
    overlay.innerHTML = `
        <div style="background:#1a1a2e;border-radius:24px;padding:24px;width:100%;max-width:420px;box-shadow:0 10px 60px rgba(0,0,0,0.7);">
            <h2 style="margin:0 0 16px;color:white;font-size:18px;font-weight:bold;">🖼️ เลือกพื้นที่รูปภาพ</h2>
            <p style="margin:0 0 16px;color:rgba(255,255,255,0.6);font-size:13px;">ลากเพื่อเลือกพื้นที่ที่ต้องการ</p>
            
            <div style="position:relative;width:100%;max-width:380px;margin:0 auto 16px;border:2px solid rgba(255,255,255,0.2);border-radius:16px;overflow:hidden;background:black;">
                <img id="cropImage" src="${imageSrc}" style="width:100%;height:auto;display:block;cursor:crosshair;">
                <canvas id="cropCanvas" style="position:absolute;top:0;left:0;cursor:crosshair;"></canvas>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                <button onclick="cancelImageUpload()" style="padding:12px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.2);background:transparent;color:white;font-size:14px;font-weight:bold;cursor:pointer;font-family:inherit;">❌ ยกเลิก</button>
                <button onclick="confirmImageUploadWithCropProfile()" style="padding:12px;border-radius:12px;border:none;background:#22c55e;color:white;font-size:14px;font-weight:bold;cursor:pointer;font-family:inherit;">✅ ใช้รูปนี้</button>
            </div>
            
            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:12px;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.6;">
                💡 <strong>คำแนะนำ:</strong> เลือกพื้นที่ที่มีใบหน้าหรือเนื้อหาหลัก
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    const img = overlay.querySelector('#cropImage');
    const canvas = overlay.querySelector('#cropCanvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
        const rect = img.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        let isSelecting = false;
        let startX, startY, endX, endY;
        
        function drawSelection() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (isSelecting && startX !== undefined) {
                const x = Math.min(startX, endX);
                const y = Math.min(startY, endY);
                const width = Math.abs(endX - startX);
                const height = Math.abs(endY - startY);
                
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.clearRect(x, y, width, height);
                
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.strokeRect(x, y, width, height);
                ctx.setLineDash([]);
                
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(x, y, width, height);
                
                // เก็บพิกัด crop (ปรับให้เป็นสัดส่วน original image)
                const scale = img.naturalWidth / canvas.width;
                cropCoords = {
                    x: Math.floor(x * scale),
                    y: Math.floor(y * scale),
                    width: Math.floor(width * scale),
                    height: Math.floor(height * scale)
                };
            }
        }
        
        canvas.addEventListener('mousedown', (e) => {
            isSelecting = true;
            const rect = canvas.getBoundingClientRect();
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            endX = startX;
            endY = startY;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!isSelecting) return;
            const rect = canvas.getBoundingClientRect();
            endX = e.clientX - rect.left;
            endY = e.clientY - rect.top;
            drawSelection();
        });
        
        canvas.addEventListener('mouseup', () => {
            isSelecting = false;
        });
        
        canvas.addEventListener('touchstart', (e) => {
            isSelecting = true;
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            startX = touch.clientX - rect.left;
            startY = touch.clientY - rect.top;
            endX = startX;
            endY = startY;
        });
        
        canvas.addEventListener('touchmove', (e) => {
            if (!isSelecting) return;
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            endX = touch.clientX - rect.left;
            endY = touch.clientY - rect.top;
            drawSelection();
        });
        
        canvas.addEventListener('touchend', () => {
            isSelecting = false;
        });
    };
    
    window.cancelImageUpload = () => {
        overlay.remove();
    };
    
    window.confirmImageUploadWithCropProfile = async () => {
        // ถ้าไม่ได้ลาก crop ให้ใช้ full image แทน (ปรับสัดส่วนให้ square)
        if (cropCoords.width === 0 || cropCoords.height === 0) {
            const img = overlay.querySelector('#cropImage');
            const size = Math.min(img.naturalWidth, img.naturalHeight);
            cropCoords = {
                x: Math.floor((img.naturalWidth - size) / 2),
                y: Math.floor((img.naturalHeight - size) / 2),
                width: size,
                height: size
            };
        }
        
        // Crop image ตัวจริง
        const croppedImage = await cropImageFromBase64(imageSrc, cropCoords);
        overlay.remove();
        onSuccess(croppedImage);
    };
}
