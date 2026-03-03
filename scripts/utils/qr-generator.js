import { db, auth } from '../auth/firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/**
 * Fetches participant data and renders the Digital ID instantly.
 * Handles potential 'undefined' event_id strings from previous registration bugs.
 * @param {string} qrContainerId - The DOM ID where the canvas QR code will be injected
 * @param {string} detailsContainerId - The DOM ID where the text data will be etched
 */
export function renderDigitalID(qrContainerId, detailsContainerId) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const detailsContainer = document.getElementById(detailsContainerId);
            const qrContainer = document.getElementById(qrContainerId);

            try {
                // Force lowercase to match the registration logic and prevent query mismatches
                const searchEmail = user.email.toLowerCase().trim();
                const q = query(collection(db, "participants"), where("gmail", "==", searchEmail));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const participantDoc = querySnapshot.docs[0];
                    const pData = participantDoc.data();

                    // FIX: Fallback for 'undefined' event_id string to prevent UI breakage
                    const displayEvent = (pData.event_id && pData.event_id !== "undefined") 
                        ? pData.event_id.replace('event_', '').toUpperCase() 
                        : "NOT ASSIGNED";

                    // Update UI with participant details
                    detailsContainer.innerHTML = `
                        <h3 style="color: #00ffcc; margin-bottom: 5px;">${pData.full_name || 'Anonymous'}</h3>
                        <p><strong>Event:</strong> ${displayEvent}</p>
                        <p><strong>Team ID:</strong> ${pData.team_id || 'Individual'}</p>
                    `;

                    // Generate the payload for the QR code
                    const qrPayload = JSON.stringify({
                        p_id: participantDoc.id,
                        e_id: pData.event_id || "undefined",
                        name: pData.full_name || "N/A",
                        t_id: pData.team_id || "INDIVIDUAL"
                    });

                    qrContainer.innerHTML = ""; // Clear the 'Loading' or 'Error' states
                    
                    // Render the QR code using the QRCode.js library
                    // HIGH CONTRAST FIX FOR WEB SCANNERS
                    new QRCode(qrContainer, {
                        text: qrPayload,
                        width: 250,
                        height: 250,
                        colorDark : "#000000",  // Pure Black
                        colorLight : "#ffffff", // Pure White
                        correctLevel : QRCode.CorrectLevel.M // Medium density (easier to read)
                    });
                    
                } else {
                    detailsContainer.innerHTML = `<p style="color: #ff4444;">Record not found for ${searchEmail}.</p>`;
                    qrContainer.innerHTML = "";
                }
            } catch (error) {
                console.error("QR Error:", error);
                // Displays the security rule or read error message
                detailsContainer.innerHTML = `
                    <p style="color: #ff4444; font-weight: bold;">SYSTEM ERROR: Check console for Firestore permissions.</p>
                `;
            }
        }
    });
}