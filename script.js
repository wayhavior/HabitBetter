async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
const app = document.getElementById("app");

/* ===== CONFIGURATION ===== */
// ✅ ลบ CLOUD_API_URL - ไม่ส่งข้อมูลขึ้น Google Sheets อีกต่อไป
const EXP_PER_LEVEL = 1000;
// Google OAuth Configuration
const GOOGLE_CLIENT_ID = "192099173031-arqdd6koquej0is89egvmna3bg7j552m.apps.googleusercontent.com"; // ✏️ เปลี่ยนเป็น Client ID ของคุณ
const GOOGLE_API_KEY = "AIzaSyATr3RANcNwBMal7MSrtkwG4p4A7vCwq5E";

/* 1. ย้ายมาบนสุดกัน Error */
function getToday() { return new Date().toISOString().split("T")[0]; }

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

// ===== INITIALIZE GOOGLE DRIVE API =====
function initializeGoogleDriveAPI() {
    if (!window.gapi) {
        console.warn("Google API library ยังไม่โหลด");
        return;
    }

    gapi.load('client:auth2', function() {
        gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            clientId: GOOGLE_CLIENT_ID,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            scope: 'https://www.googleapis.com/auth/drive.file'
        }).then(function() {
            console.log("Google Drive API initialized successfully");
        }).catch(function(error) {
            console.error("Error initializing Google Drive API:", error);
        });
    });
}

function initializeGoogleLogin() {
    if (!window.google) {
        alert("Google Sign-In library ยังไม่โหลด กรุณารอสักครู่");
        return;
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleLogin
    });
    initializeGoogleDriveAPI();
}

function handleGoogleLogin(response) {
    const token = response.credential;
    
    // Decode token เพื่อดึงข้อมูล user
    const userData = decodeJWT(token);
    
    if (userData) {
        console.log("Google Login Success:", userData);
        
        // เก็บข้อมูล user ใน localStorage
        localStorage.setItem("googleToken", token);
        localStorage.setItem("googleUser", JSON.stringify({
            email: userData.email,
            name: userData.name,
            picture: userData.picture,
            loginTime: new Date().toISOString()
        }));
        
        // refresh หน้า Settings เพื่อแสดงข้อมูล user ใหม่
        render();
    } else {
        alert("ไม่สามารถประมวลผล token ได้ กรุณาลองใหม่");
    }
}

function logout() {
    localStorage.removeItem("googleToken");
    localStorage.removeItem("googleUser");
    
    // ออก Google session
    if (window.google) {
        google.accounts.id.disableAutoSelect();
    }
    
    render();
}

// ===== BACKUP FUNCTION =====
async function backupToGoogleDrive() {
    try {
        // ✅ ตรวจสอบว่า gapi โหลดแล้ว
        if (!window.gapi || !window.gapi.auth2) {
            alert("⚠️ Google API ยังไม่พร้อม กรุณารอสักครู่");
            return;
        }

        const auth = gapi.auth2.getAuthInstance();
        
        if (!auth || !auth.isSignedIn.get()) {
            alert("⚠️ กรุณาล็อกอิน Google ก่อน");
            return;
        }

        // เก็บข้อมูลทั้งหมด
        const backupData = {
            tracker: localStorage.getItem("tracker"),
            way_piggy: localStorage.getItem("way_piggy"),
            saving_jars: localStorage.getItem("saving_jars"),
            titanPoints: localStorage.getItem("titanPoints"),
            notes: localStorage.getItem("notes"),
            expenses: localStorage.getItem("expenses"),
            tasks: localStorage.getItem("tasks"),
            routines: localStorage.getItem("routines"),
            timestamp: new Date().toISOString()
        };

        // สร้าง file ขึ้น Google Drive
        const file = new Blob([JSON.stringify(backupData, null, 2)], {type: 'application/json'});
        const metadata = {
            name: `HabitBetter-Backup-${Date.now()}.json`,
            mimeType: 'application/json'
        };

        // ✅ ใช้ gapi.client.drive.files.create แทน fetch
        const response = await gapi.client.drive.files.create({
            resource: metadata,
            media: file,
            fields: 'id, name, createdTime'
        });

        if (response.status === 200) {
            alert("✅ Backup สำเร็จ! ข้อมูลถูกบันทึกไปยัง Google Drive\nไฟล์: " + response.result.name);
        } else {
            alert("❌ Backup ล้มเหลว (Status: " + response.status + ")");
        }
    } catch (error) {
        console.error("Backup error:", error);
        alert("❌ เกิดข้อผิดพลาด: " + error.message);
    }
}

// ===== RESTORE FUNCTION =====
async function restoreFromGoogleDrive() {
    try {
        // ✅ ตรวจสอบว่า gapi โหลดแล้ว
        if (!window.gapi || !window.gapi.auth2) {
            alert("⚠️ Google API ยังไม่พร้อม กรุณารอสักครู่");
            return;
        }

        const auth = gapi.auth2.getAuthInstance();
        
        if (!auth || !auth.isSignedIn.get()) {
            alert("⚠️ กรุณาล็อกอิน Google ก่อน");
            return;
        }

        // ค้นหา backup files
        const response = await gapi.client.drive.files.list({
            q: "name contains 'HabitBetter-Backup' and trashed=false",
            spaces: 'drive',
            pageSize: 10,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc'
        });

        const files = response.result.files;
        
        if (!files || files.length === 0) {
            alert("ไม่พบ backup files ในระบบของคุณ");
            return;
        }

        // เลือก backup ที่ใหม่ที่สุด
        const latestFile = files[0];
        
        // ดาวน์โหลด file
        const fileContent = await gapi.client.drive.files.get({
            fileId: latestFile.id,
            alt: 'media'
        });

        // restore ข้อมูล
        const restoredData = fileContent.result;
        
        Object.keys(restoredData).forEach(key => {
            if (key !== 'timestamp') {
                localStorage.setItem(key, restoredData[key]);
            }
        });

        alert("✅ Restore สำเร็จ! ข้อมูลได้ถูกคืนกลับแล้ว");
        window.location.reload();
    } catch (error) {
        console.error("Restore error:", error);
        alert("❌ เกิดข้อผิดพลาด: " + error.message);
    }
}

// === ADD YOUR REMAINING SCRIPT CODE HERE ===
// (แนบโค้ดที่เหลือจากบรรทัด 181 เป็นต้นไป)

// === EVENT HANDLERS FOR SETTINGS PAGE ===
function setupSettingsEventHandlers() {
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
                    localStorage.setItem("titan_points", "0");
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
    }, 50);
}

// ฟังก์ชันสำหรับสั่งให้ปุ่มพิเศษทั้งหมด อัปเดตการแสดงผลทันทีตามสวิตช์
function updateSpecialButtonsVisibility() {
    if (settingsBtn) settingsBtn.style.display = specialButtonsVisible ? "block" : "none";
    if (themeBtn) themeBtn.style.display = specialButtonsVisible ? "block" : "none";
    if (typeof zoomBtns !== "undefined") {
        zoomBtns.forEach(btn => btn.style.display = specialButtonsVisible ? "block" : "none");
    }
}
