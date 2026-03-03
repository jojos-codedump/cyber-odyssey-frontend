// scripts/events/codeshield-ui.js
import { db } from '../auth/firebase-config.js';
import { doc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 1. DIGITAL RAIN <CANVAS> EFFECT
// ==========================================
const canvas = document.getElementById('matrix-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const alphabet = "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレゲゼデベペオォコソトノホモヨョロゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const fontSize = 16;
let columns = canvas.width / fontSize;
const drops = [];
for (let x = 0; x < columns; x++) {
    drops[x] = 1;
}

function drawMatrix() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ffcc';
    ctx.font = fontSize + 'px monospace';

    for (let i = 0; i < drops.length; i++) {
        const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
            drops[i] = 0;
        }
        drops[i]++;
    }
}
setInterval(drawMatrix, 33);

// ==========================================
// 2. GLOBAL SYNCHRONIZED TIMER LOGIC
// ==========================================
const display = document.getElementById('countdown-display');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');

// Configuration
const TOTAL_DURATION_SECONDS = 7 * 60 * 60; // 7 Hours
const timerDocRef = doc(db, "event_settings", "codeshield");

let localInterval = null;
const userRole = sessionStorage.getItem("userRole");

/**
 * Formats seconds into HH:MM:SS
 */
function formatTime(seconds) {
    if (seconds <= 0) return "00:00:00";
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * Updates the physical DOM and applies visual alerts
 */
function updateUI(seconds) {
    display.innerText = formatTime(seconds);
    if (seconds <= 1800 && seconds > 0) { // Last 30 minutes
        display.style.color = '#ff4444';
        display.style.textShadow = '0 0 20px #ff4444';
    } else if (seconds <= 0) {
        display.innerText = "SYSTEM COMPROMISED";
        display.style.color = '#ff4444';
    } else {
        display.style.color = '#00ffcc';
        display.style.textShadow = '0 0 20px #00ffcc';
    }
}

/**
 * Core Synchronization Logic: Listens to Firestore
 */
onSnapshot(timerDocRef, (snapshot) => {
    if (!snapshot.exists()) {
        console.warn("Timer settings missing. Initializing...");
        return;
    }

    const data = snapshot.data();
    clearInterval(localInterval);

    if (data.status === 'running') {
        // Calculate remaining time based on server start time
        const startTime = data.startTime.toDate().getTime();
        
        localInterval = setInterval(() => {
            const now = Date.now();
            const elapsedSeconds = (now - startTime) / 1000;
            const remaining = TOTAL_DURATION_SECONDS - elapsedSeconds;
            
            updateUI(remaining);

            if (remaining <= 0) {
                clearInterval(localInterval);
            }
        }, 1000);

        // UI Adjustments for Admin/Volunteer
        if (userRole === 'Admin') {
            btnStart.style.display = 'none';
            btnPause.style.display = 'inline-block';
            btnPause.innerText = 'PAUSE';
            btnReset.style.display = 'inline-block';
        }
    } 
    else if (data.status === 'paused') {
        updateUI(data.pausedAt);
        if (userRole === 'Admin') {
            btnStart.style.display = 'none';
            btnPause.style.display = 'inline-block';
            btnPause.innerText = 'RESUME';
            btnReset.style.display = 'inline-block';
        }
    } 
    else { // status === 'reset' or 'idle'
        updateUI(TOTAL_DURATION_SECONDS);
        if (userRole === 'Admin') {
            btnStart.style.display = 'inline-block';
            btnPause.style.display = 'none';
            btnReset.style.display = 'none';
        }
    }
});

// ==========================================
// 3. ADMIN CONTROL OVERRIDES (Write to DB)
// ==========================================
if (userRole === 'Admin') {
    btnStart.addEventListener('click', async () => {
        await updateDoc(timerDocRef, {
            status: 'running',
            startTime: serverTimestamp()
        });
    });

    btnPause.addEventListener('click', async () => {
        // Calculate current remaining to lock it in DB
        const snapshot = await (await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js")).getDoc(timerDocRef);
        const data = snapshot.data();
        
        if (data.status === 'running') {
            const startTime = data.startTime.toDate().getTime();
            const elapsed = (Date.now() - startTime) / 1000;
            const remaining = Math.max(0, TOTAL_DURATION_SECONDS - elapsed);
            
            await updateDoc(timerDocRef, {
                status: 'paused',
                pausedAt: remaining
            });
        } else {
            // Resume: recalculate start time so elapsed matches where we left off
            const newStartTime = new Date(Date.now() - (TOTAL_DURATION_SECONDS - data.pausedAt) * 1000);
            await updateDoc(timerDocRef, {
                status: 'running',
                startTime: newStartTime
            });
        }
    });

    btnReset.addEventListener('click', async () => {
        if (confirm("OVERRIDE DETECTED: Are you sure you want to reset the global timer?")) {
            await updateDoc(timerDocRef, {
                status: 'reset',
                pausedAt: TOTAL_DURATION_SECONDS
            });
        }
    });
} else {
    // Hide controls for non-admins to prevent UI clutter
    btnStart.style.display = 'none';
    btnPause.style.display = 'none';
    btnReset.style.display = 'none';
}