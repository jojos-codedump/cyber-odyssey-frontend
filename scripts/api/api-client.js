// scripts/api/api-client.js
import { auth } from '../auth/firebase-config.js';

const BASE_URL = 'https://cyber-odyssey-backend.onrender.com/api/v1';

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN HELPER
// Gets a fresh Firebase ID token for the currently logged-in user.
// Firebase caches it and auto-refreshes before expiry, so calling this on
// every request is safe and cheap — no extra network calls in practice.
// ─────────────────────────────────────────────────────────────────────────────
async function getAuthHeaders() {
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated session. Please log in again.');
    const token = await user.getIdToken();
    return {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': `Bearer ${token}`,
    };
}

// Headers for the two genuinely public endpoints (no login required)
const PUBLIC_HEADERS = { 'Accept': 'application/json' };

// ─────────────────────────────────────────────────────────────────────────────
// ERROR UNWRAPPER — matches Pydantic + FastAPI error shapes
// ─────────────────────────────────────────────────────────────────────────────
async function unwrapError(response, fallback) {
    try {
        const body = await response.json();
        return body.detail?.[0]?.msg || body.detail || fallback || `HTTP ${response.status}`;
    } catch {
        return fallback || `HTTP ${response.status}`;
    }
}

export const apiClient = {

    // -----------------------------------------------------------------
    // PUBLIC — no token required
    // -----------------------------------------------------------------

    /**
     * Fetches all events and their current capacities.
     * Called before login on the registration page.
     */
    async fetchEvents() {
        const response = await fetch(`${BASE_URL}/events`, { headers: PUBLIC_HEADERS });
        if (!response.ok) throw new Error('Failed to fetch events from grid.');
        return response.json();
    },

    async getServerTime() {
        const response = await fetch(`${BASE_URL}/system/time`, { headers: PUBLIC_HEADERS });
        if (!response.ok) throw new Error('Failed to synchronize with server clock.');
        return response.json();
    },

    // -----------------------------------------------------------------
    // AUTHENTICATED — any logged-in user
    // -----------------------------------------------------------------

    /**
     * Creates a new team in the database.
     * UPDATED: Strict validation prevents "undefined" event_id injection.
     */
    async createTeam(eventId, teamName) {
        if (!eventId || String(eventId) === 'undefined' || String(eventId).trim() === '') {
            console.error('CRITICAL: Attempted to create team with invalid eventId:', eventId);
            throw new Error('Logic Error: Event selection was lost. Please re-select the event.');
        }

        const response = await fetch(`${BASE_URL}/teams`, {
            method:  'POST',
            headers: await getAuthHeaders(),
            body:    JSON.stringify({ event_id: String(eventId), team_name: String(teamName) }),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'Team creation failed.'));
        return response.json();
    },

    /**
     * Registers a participant and calculates status.
     * UPDATED: Strict validation prevents corrupting the participants collection.
     */
    async registerParticipant(participantData) {
        if (!participantData.event_id || String(participantData.event_id) === 'undefined') {
            console.error('CRITICAL: Registration payload missing valid event_id:', participantData);
            throw new Error('Logic Error: The event ID was corrupted. Registration aborted to prevent database desync.');
        }

        const response = await fetch(`${BASE_URL}/participants`, {
            method:  'POST',
            headers: await getAuthHeaders(),
            body:    JSON.stringify(participantData),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'Registration failed.'));
        return response.json();
    },

    /**
     * Syncs Firebase Auth users to the Render database.
     */
    async syncUser(uid, email, role, assignedEvent = '') {
        const response = await fetch(`${BASE_URL}/users/sync`, {
            method:  'POST',
            headers: await getAuthHeaders(),
            body:    JSON.stringify({
                uid:            String(uid),
                email:          String(email).toLowerCase(), // Force lowercase sync
                role:           String(role),
                assigned_event: assignedEvent || '',
            }),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'User sync failed.'));
        return response.json();
    },

    // -----------------------------------------------------------------
    // AUTHENTICATED — Admin or Volunteer
    // -----------------------------------------------------------------

    /**
     * Logs a QR check-in to the backend attendance ledger.
     */
    async logAttendanceScan(scanData) {
        const response = await fetch(`${BASE_URL}/attendance/scan`, {
            method:  'POST',
            headers: await getAuthHeaders(),
            body:    JSON.stringify(scanData),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'Check-in rejected by grid.'));
        return response.json();
    },

    async fetchEventRoster(eventId) {
        const response = await fetch(`${BASE_URL}/admin/events/${eventId}/roster`, {
            headers: await getAuthHeaders(),
        });
        if (!response.ok) throw new Error(await unwrapError(response, 'Unauthorized: Roster access denied.'));
        return response.json();
    },

    /**
     * PHASE 3: UPDATE (PATCH)
     * Securely updates a participant's data via backend Admin SDK.
     */
    async updateParticipantData(participantId, updatedPayload) {
        const response = await fetch(`${BASE_URL}/admin/participants/${participantId}`, {
            method:  'PATCH',
            headers: await getAuthHeaders(),
            body:    JSON.stringify(updatedPayload),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'Failed to update node data.'));
        return response.json();
    },

    /**
     * Fetches the real-time stream of QR scan check-ins.
     */
    async fetchAttendanceLogs() {
        const response = await fetch(`${BASE_URL}/admin/attendance/logs`, {
            headers: await getAuthHeaders(),
        });
        if (!response.ok) throw new Error(await unwrapError(response, 'Failed to fetch attendance logs.'));
        return response.json();
    },

    // -----------------------------------------------------------------
    // AUTHENTICATED — Admin only
    // -----------------------------------------------------------------

    /**
     * Registers a new volunteer node via Admin SDK.
     */
    async registerVolunteer(volunteerData) {
        const response = await fetch(`${BASE_URL}/admin/volunteers`, {
            method:  'POST',
            headers: await getAuthHeaders(),
            body:    JSON.stringify(volunteerData),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'Volunteer authorization failed.'));
        return response.json();
    },

    /**
     * PHASE 3: DELETE
     * Securely deletes a participant node via backend Admin SDK.
     */
    async removeParticipant(participantId) {
        const response = await fetch(`${BASE_URL}/admin/participants/${participantId}`, {
            method:  'DELETE',
            headers: await getAuthHeaders(),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'Failed to revoke node access.'));
        return response.json();
    },

    /**
     * PHASE 4: FETCH STAFF
     * Fetches the active staff roster (Admins and Volunteers).
     */
    async fetchActiveStaff() {
        const response = await fetch(`${BASE_URL}/admin/staff`, {
            headers: await getAuthHeaders(),
        });
        if (!response.ok) throw new Error(await unwrapError(response, 'Failed to fetch staff matrix.'));
        return response.json();
    },

    /**
     * Dispatches a bulk communication to all participants of an event.
     */
    async dispatchComms(payload) {
        const response = await fetch(`${BASE_URL}/admin/comms/dispatch`, {
            method:  'POST',
            headers: await getAuthHeaders(),
            body:    JSON.stringify(payload),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'Comms dispatch failed.'));
        return response.json();
    },

    /**
     * Submits a judge evaluation for a participant or team.
     */
    async submitEvaluation(payload) {
        const response = await fetch(`${BASE_URL}/evaluations/submit`, {
            method:  'POST',
            headers: await getAuthHeaders(),
            body:    JSON.stringify(payload),
        });

        if (!response.ok) throw new Error(await unwrapError(response, 'Evaluation submission failed.'));
        return response.json();
    },
};