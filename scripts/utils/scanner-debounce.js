// scripts/utils/scanner-debounce.js
import { apiClient } from '../api/api-client.js';

const DEBOUNCE_TIME = 3000; 
let isProcessing = false;
let lastScannedId = null;
let debounceTimer = null;

export async function handleScan(rawData, volunteerUid) {
    if (isProcessing) return; 

    try {
        const data = JSON.parse(rawData);
        const { p_id, e_id } = data;

        if (p_id === lastScannedId) {
            console.warn("Duplicate scan detected. Cooling down...");
            return;
        }

        isProcessing = true;
        lastScannedId = p_id;
        
        triggerScanFeedback("processing");

        // FIX: Pack the data into the exact Schema the backend expects
        const payload = {
            event_id: e_id,
            participant_id: p_id,
            scanned_by_uid: volunteerUid
        };

        const response = await apiClient.logAttendanceScan(payload);
        console.log("Check-in Successful:", response);
        triggerScanFeedback("success");

    } catch (error) {
        console.error("Scan Error:", error.message);
        triggerScanFeedback("error", error.message);
        lastScannedId = null;
    } finally {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            isProcessing = false;
            lastScannedId = null; 
            triggerScanFeedback("ready");
        }, DEBOUNCE_TIME);
    }
}

function triggerScanFeedback(status, message = "") {
    const feedbackEl = document.getElementById('scan-feedback');
    if (!feedbackEl) return;

    switch (status) {
        case "processing":
            feedbackEl.innerText = "Processing Check-in...";
            feedbackEl.style.color = "#888";
            break;
        case "success":
            feedbackEl.innerText = "CHECK-IN SUCCESSFUL";
            feedbackEl.style.color = "#00ffcc";
            if (window.navigator.vibrate) window.navigator.vibrate(100); 
            break;
        case "error":
            feedbackEl.innerText = `ERROR: ${message}`;
            feedbackEl.style.color = "#ff4444";
            break;
        case "ready":
            feedbackEl.innerText = "READY FOR NEXT SCAN";
            feedbackEl.style.color = "#555";
            break;
    }
}