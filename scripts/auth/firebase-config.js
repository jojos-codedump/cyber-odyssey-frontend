import { 
    initializeApp, 
    getApps, 
    getApp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Your specific Firebase project configuration
// You can find these values in the Firebase Console: Project Settings > General
const firebaseConfig = {
  apiKey: "AIzaSyBkql18eqjn8oosFew1qxdvaBpZ72PQytU",
  authDomain: "cyber-odyssey.firebaseapp.com",
  projectId: "cyber-odyssey",
  storageBucket: "cyber-odyssey.firebasestorage.app",
  messagingSenderId: "1090941594764",
  appId: "1:1090941594764:web:636d2297c51f8dbb89dfa9",
  measurementId: "G-46Q84DSPP4"
};

let app;

// Robust Initialization: Prevent duplicate initializations across module imports
try {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
        console.log("Firebase initialized successfully.");
    } else {
        app = getApp(); // Use the existing initialized app
    }
} catch (error) {
    console.error("Critical Firebase initialization error:", error);
}

// Export the specific services required by the Cyber Odyssey architecture
// Auth handles secure logins and credential storage 
export const auth = getAuth(app);

// Firestore handles real-time data, NoSQL documents, and security rule enforcement [cite: 71, 122-124]
export const db = getFirestore(app);