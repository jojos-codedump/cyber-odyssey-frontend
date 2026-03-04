// scripts/events/codeshield-ui.js
// ─────────────────────────────────────────────────────────────────────────────
// CodeShield Timer Engine
// – Shows a "time until start" pre-start panel before the scheduled launch
// – Auto-switches to the 7-hour hackathon timer at exactly 10:00 AM IST, 7 Mar 2026
// – Syncs all participants in real-time via Firestore (admin writes, everyone reads)
// – Drives the visual bridge functions defined in codeshield.html
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../auth/firebase-config.js';
import {
    doc, onSnapshot, updateDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ── Constants ────────────────────────────────────────────────────────────────
const TOTAL_SECONDS = 7 * 60 * 60;                    // 25,200 s

// 10:00 AM IST = 04:30 UTC on 7 March 2026
const SCHEDULED_START_MS = new Date('2026-03-07T04:30:00.000Z').getTime();
const SCHEDULED_END_MS   = SCHEDULED_START_MS + TOTAL_SECONDS * 1000;

const timerDocRef = doc(db, 'event_settings', 'codeshield');
const userRole    = sessionStorage.getItem('userRole');

// ── DOM refs ─────────────────────────────────────────────────────────────────
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');

// ── State ────────────────────────────────────────────────────────────────────
let localInterval    = null;   // ticks UI every second
let prestartInterval = null;   // ticks pre-start countdown
let currentPhase     = null;   // 'prestart' | 'running' | 'paused' | 'ended'

// ── Helpers ──────────────────────────────────────────────────────────────────
function clearAll() {
    clearInterval(localInterval);
    clearInterval(prestartInterval);
    localInterval    = null;
    prestartInterval = null;
}

function log(msg, level) {
    if (typeof window._addLog === 'function') window._addLog(msg, level);
}

function setDigits(rem) {
    if (typeof window._setDigits === 'function') window._setDigits(rem);
}

function enterPhase(phase) {
    if (phase === currentPhase) return;
    currentPhase = phase;
    if (typeof window._setPhase === 'function') window._setPhase(phase);
}

// ── Pre-start countdown (client-side only, no Firestore needed) ───────────────
function startPrestartTick() {
    clearAll();

    function tick() {
        const secsLeft = Math.max(0, (SCHEDULED_START_MS - Date.now()) / 1000);
        if (typeof window._updatePrestart === 'function') window._updatePrestart(secsLeft);

        if (secsLeft <= 0) {
            // Time's up — switch to active panel
            clearInterval(prestartInterval);
            prestartInterval = null;
            log('Scheduled launch reached. Auto-initiating hackathon.', '');
            autoInitiate();
        }
    }

    enterPhase('prestart');
    tick();
    prestartInterval = setInterval(tick, 1000);
}

// ── Auto-initiate at scheduled time ──────────────────────────────────────────
// If admin hasn't manually started the timer yet, write 'running' to Firestore
// using the SCHEDULED_START_MS as the reference (not serverTimestamp) so the
// remaining time is computed correctly from the intended start, not from "now".
async function autoInitiate() {
    try {
        const snap = await getDoc(timerDocRef);
        if (!snap.exists()) {
            // Document doesn't exist — create it
            await updateDoc(timerDocRef, {
                status:    'running',
                startTime: new Date(SCHEDULED_START_MS),
                pausedAt:  TOTAL_SECONDS
            });
            log('Timer document initialised and started.', '');
            return;
        }

        const data = snap.data();
        // Only write if not already running or paused by an admin
        if (data.status !== 'running' && data.status !== 'paused') {
            await updateDoc(timerDocRef, {
                status:    'running',
                startTime: new Date(SCHEDULED_START_MS),
                pausedAt:  TOTAL_SECONDS
            });
            log('Auto-initiated: timer written to Firestore.', '');
        }
    } catch (err) {
        // If the doc doesn't exist yet, updateDoc fails — fall back to a local timer
        console.warn('Firestore write failed (doc may not exist yet). Running local timer.', err);
        runLocalFallback();
    }
}

// ── Local fallback (no Firestore doc) ────────────────────────────────────────
function runLocalFallback() {
    clearAll();
    enterPhase('running');
    const elapsed = Math.max(0, (Date.now() - SCHEDULED_START_MS) / 1000);
    let   rem     = Math.max(0, TOTAL_SECONDS - elapsed);
    setDigits(rem);

    localInterval = setInterval(() => {
        rem -= 1;
        if (rem <= 0) {
            rem = 0;
            setDigits(0);
            clearInterval(localInterval);
            enterPhase('ended');
            log('SESSION EXPIRED — system compromised.', 'crit');
            return;
        }
        setDigits(rem);
    }, 1000);
}

// ── Firestore real-time listener ──────────────────────────────────────────────
onSnapshot(timerDocRef, (snapshot) => {
    if (!snapshot.exists()) {
        // Document hasn't been created yet.
        // Check whether we're before or after the scheduled start.
        const now = Date.now();
        if (now < SCHEDULED_START_MS) {
            startPrestartTick();
        } else {
            // We're past the scheduled time but the doc doesn't exist.
            // Only admins can write; everyone else falls back to local.
            if (userRole === 'Admin') {
                autoInitiate();
            } else {
                runLocalFallback();
            }
        }
        return;
    }

    const data = snapshot.data();
    clearAll();

    // ── RUNNING ──────────────────────────────────────────────────────────────
    if (data.status === 'running') {
        enterPhase('running');
        showAdminControls('running');

        // The startTime stored is the hackathon's clock zero (may be SCHEDULED_START_MS
        // or an admin override). Compute remaining from it.
        const startMs = data.startTime.toDate
            ? data.startTime.toDate().getTime()
            : new Date(data.startTime).getTime();

        const elapsed = (Date.now() - startMs) / 1000;
        let   rem     = Math.max(0, TOTAL_SECONDS - elapsed);

        setDigits(rem);
        if (rem <= 0) { enterPhase('ended'); return; }

        log('Hackathon RUNNING — 7-hour clock active.');
        window._burstParticles?.('#00ffcc');

        localInterval = setInterval(() => {
            const e2  = (Date.now() - startMs) / 1000;
            rem        = Math.max(0, TOTAL_SECONDS - e2);
            setDigits(rem);

            if (rem <= 0) {
                clearInterval(localInterval);
                enterPhase('ended');
                log('SESSION EXPIRED — system compromised.', 'crit');
            }
        }, 1000);

    // ── PAUSED ───────────────────────────────────────────────────────────────
    } else if (data.status === 'paused') {
        enterPhase('paused');
        showAdminControls('paused');

        const rem = typeof data.pausedAt === 'number' ? data.pausedAt : TOTAL_SECONDS;
        if (typeof window._setPaused === 'function') window._setPaused(rem);
        log('Clock PAUSED by operator.', 'warn');

    // ── PRESTART / RESET / IDLE ───────────────────────────────────────────────
    } else {
        // status is 'reset', 'idle', or anything else
        const now = Date.now();
        if (now < SCHEDULED_START_MS) {
            startPrestartTick();
        } else {
            // Past start time but manually reset by admin — show full timer, standby
            enterPhase('running');
            setDigits(TOTAL_SECONDS);
            showAdminControls('idle');
        }
    }
});

// ── Admin button visibility ───────────────────────────────────────────────────
function showAdminControls(state) {
    if (userRole !== 'Admin') {
        // Always hidden for non-admins
        [btnStart, btnPause, btnReset].forEach(b => { if (b) b.style.display = 'none'; });
        return;
    }

    if (state === 'running') {
        if (btnStart) btnStart.style.display = 'none';
        if (btnPause) { btnPause.style.display = 'inline-block'; btnPause.innerText = '⏸ Pause'; }
        if (btnReset) btnReset.style.display = 'inline-block';
    } else if (state === 'paused') {
        if (btnStart) btnStart.style.display = 'none';
        if (btnPause) { btnPause.style.display = 'inline-block'; btnPause.innerText = '▶ Resume'; }
        if (btnReset) btnReset.style.display = 'inline-block';
    } else {
        // idle / prestart
        if (btnStart) btnStart.style.display = 'inline-block';
        if (btnPause) btnPause.style.display = 'none';
        if (btnReset) btnReset.style.display = 'none';
    }
}

// ── Admin control writes ──────────────────────────────────────────────────────
if (userRole === 'Admin') {

    // Force-start (bypasses the schedule — useful if admin wants to begin early)
    btnStart?.addEventListener('click', async () => {
        await updateDoc(timerDocRef, {
            status:    'running',
            startTime: serverTimestamp()    // admin-initiated = start from NOW
        });
        log('Admin force-initiated. Clock running from now.', '');
    });

    btnPause?.addEventListener('click', async () => {
        const snap = await getDoc(timerDocRef);
        if (!snap.exists()) return;
        const data = snap.data();

        if (data.status === 'running') {
            const startMs = data.startTime.toDate
                ? data.startTime.toDate().getTime()
                : new Date(data.startTime).getTime();
            const elapsed = (Date.now() - startMs) / 1000;
            const rem     = Math.max(0, TOTAL_SECONDS - elapsed);

            await updateDoc(timerDocRef, { status: 'paused', pausedAt: rem });
            log('Clock PAUSED by admin.', 'warn');

        } else if (data.status === 'paused') {
            // Resume: set a synthetic startTime so that elapsed = TOTAL - pausedAt
            const pausedAt    = typeof data.pausedAt === 'number' ? data.pausedAt : TOTAL_SECONDS;
            const synthStart  = new Date(Date.now() - (TOTAL_SECONDS - pausedAt) * 1000);
            await updateDoc(timerDocRef, { status: 'running', startTime: synthStart });
            log('Clock RESUMED by admin.', '');
        }
    });

    btnReset?.addEventListener('click', async () => {
        if (!confirm('OVERRIDE DETECTED: Reset the global timer to standby?')) return;
        await updateDoc(timerDocRef, { status: 'reset', pausedAt: TOTAL_SECONDS });
        log('System RESET by admin.', 'crit');
    });

} else {
    // Non-admins never see controls
    [btnStart, btnPause, btnReset].forEach(b => { if (b) b.style.display = 'none'; });
}