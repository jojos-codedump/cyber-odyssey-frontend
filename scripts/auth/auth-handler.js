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

/**
 * Authenticates a user and routes them based on their Firestore role.
 */
export async function loginUser(email, password) {
    try {
        // 1. Authenticate via Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Fetch the user's assigned role from the Firestore 'users' collection
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();

            // Store role and event data in sessionStorage for instant frontend checks
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
        if (error.code === 'auth/wrong-password') msg = "Incorrect security passcode.";
        
        alert(msg);
        throw error; 
    }
}

/**
 * Routes the authenticated user to their designated portal.
 */
export function routeUserBasedOnRole(role) {
    switch (role) {
        case "Admin":
            window.location.href = "/pages/dashboards/admin.html";
            break;
        case "Volunteer":
            window.location.href = "/pages/dashboards/volunteer.html";
            break;
        case "Judge":
            window.location.href = "/pages/dashboards/judge.html";
            break;
        case "Participant":
            window.location.href = "/pages/participant/digital-id.html";
            break;
        default:
            console.error("Unauthorized role detected:", role);
            logoutUser();
    }
}

/**
 * Safely terminates the user session and clears local storage.
 */
export async function logoutUser() {
    try {
        await signOut(auth);
        sessionStorage.clear();
        window.location.href = "/pages/auth/login.html";
    } catch (error) {
        console.error("Error signing out:", error);
    }
}

/**
 * Middleware to monitor auth state and enforce role-based access.
 * Usage: monitorAuthState(true, ['Admin', 'Volunteer']);
 */
export function monitorAuthState(requireAuth = true, allowedRoles = []) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const currentRole = sessionStorage.getItem("userRole");
            
            // If the user is logged in but their role isn't in the allowed list for this page
            if (allowedRoles.length > 0 && !allowedRoles.includes(currentRole)) {
                alert("ACCESS DENIED: Unauthorized Role.");
                routeUserBasedOnRole(currentRole); 
            }
        } else {
            // If the user is logged out but the page requires authentication
            if (requireAuth) {
                window.location.href = "/pages/auth/login.html";
            }
        }
    });
}