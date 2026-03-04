// scripts/auth/auth-handler.js
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

// ─────────────────────────────────────────────────────────────────────────────
// RACE WINDOW FIX
// The body is hidden immediately via an inline <style> injected into <head>
// before any content renders. It is only revealed once auth is confirmed.
// This closes the ~300ms–1.5s window where the full page was visible while
// onAuthStateChanged hadn't fired yet (exploitable via fast back/forward nav).
// ─────────────────────────────────────────────────────────────────────────────
(function hideBodyUntilAuthConfirmed() {
    const style = document.createElement('style');
    style.id = '__auth_guard';
    style.textContent = 'body { visibility: hidden !important; }';
    document.head.appendChild(style);
})();

function revealBody() {
    const s = document.getElementById('__auth_guard');
    if (s) s.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// Authenticates a user and routes them based on their Firestore role.
// ─────────────────────────────────────────────────────────────────────────────
export async function loginUser(email, password) {
    try {
        // 1. Authenticate via Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Fetch the user's assigned role from the Firestore 'users' collection
        const userDocRef  = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();

            // Store role and event data in sessionStorage for cheap reads elsewhere
            sessionStorage.setItem("userRole", userData.role);
            if (userData.assigned_event) {
                sessionStorage.setItem("assignedEvent", userData.assigned_event);
            }

            // Execute routing
            routeUserBasedOnRole(userData.role);
        } else {
            console.error("Critical: User document missing in Firestore!");
            alert("Security Error: Your account profile is incomplete. Contact an Admin.");
            await logoutUser();
        }
    } catch (error) {
        console.error("Login Error:", error.code);
        let msg = "Login failed. Please verify your credentials.";
        if (error.code === 'auth/user-not-found') msg = "No neural signature found for this email.";
        if (error.code === 'auth/wrong-password')  msg = "Incorrect security passcode.";
        alert(msg);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTING
// Routes the authenticated user to their designated portal.
// ─────────────────────────────────────────────────────────────────────────────
export function routeUserBasedOnRole(role) {
    switch (role) {
        case "Admin":       window.location.href = "/pages/dashboards/admin.html";       break;
        case "Volunteer":   window.location.href = "/pages/dashboards/volunteer.html";   break;
        case "Judge":       window.location.href = "/pages/dashboards/judge.html";       break;
        case "Participant": window.location.href = "/pages/participant/digital-id.html"; break;
        default:
            console.error("Unauthorized role detected:", role);
            logoutUser();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// Safely terminates the user session and clears local storage.
// ─────────────────────────────────────────────────────────────────────────────
export async function logoutUser() {
    try {
        await signOut(auth);
        sessionStorage.clear();
        window.location.href = "/pages/auth/login.html";
    } catch (error) {
        console.error("Error signing out:", error);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH GUARD  (replaces the old monitorAuthState)
//
// Drop-in replacement — all call sites using monitorAuthState(true, [...])
// work without any changes.
//
// What changed vs the original:
//
//   1. Body is already hidden (see top of file). Revealed only on success,
//      which closes the fast back/forward race window entirely.
//
//   2. Role is verified from FIRESTORE, not sessionStorage. sessionStorage is
//      user-controlled — anyone can open DevTools and set:
//        sessionStorage.setItem("userRole", "Admin")
//      Firestore cannot be tampered with from the browser. sessionStorage is
//      still written on success so the rest of the app can read it cheaply,
//      but it is no longer the source of truth for access decisions.
//
//   3. Fails closed — any Firestore error redirects to login rather than
//      accidentally revealing the page.
// ─────────────────────────────────────────────────────────────────────────────
export function monitorAuthState(requireAuth = true, allowedRoles = []) {
    onAuthStateChanged(auth, async (user) => {

        // ── No session ────────────────────────────────────────────────────────
        if (!user) {
            if (requireAuth) {
                window.location.href = "/pages/auth/login.html";
            } else {
                revealBody();
            }
            return;
        }

        // ── Verify role from Firestore (not sessionStorage) ──────────────────
        try {
            const userDocRef  = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                // Auth account exists but no Firestore profile — orphan account
                console.error("Auth/Firestore mismatch for uid:", user.uid);
                await logoutUser();
                return;
            }

            const userData   = userDocSnap.data();
            const actualRole = userData.role;

            // Keep sessionStorage in sync for cheap reads elsewhere in the app
            sessionStorage.setItem("userRole", actualRole);
            if (userData.assigned_event) {
                sessionStorage.setItem("assignedEvent", userData.assigned_event);
            }

            // ── Role check ───────────────────────────────────────────────────
            if (allowedRoles.length > 0 && !allowedRoles.includes(actualRole)) {
                // Wrong role for this page — redirect silently to where they belong
                routeUserBasedOnRole(actualRole);
                return;
            }

            // ── All checks passed — show the page ────────────────────────────
            revealBody();

        } catch (err) {
            console.error("Auth guard Firestore check failed:", err);
            // Fail closed — on any Firestore error, don't reveal the page
            window.location.href = "/pages/auth/login.html";
        }
    });
}