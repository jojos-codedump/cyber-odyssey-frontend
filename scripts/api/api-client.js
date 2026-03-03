// scripts/api/api-client.js

// Base URL from your Render deployment
const BASE_URL = 'https://cyber-odyssey-backend.onrender.com/api/v1';

export const apiClient = {
    // -----------------------------------------------------------------
    // REGISTRATION & EVENTS
    // -----------------------------------------------------------------

    /**
     * Fetches all events and their current capacities.
     */
    async fetchEvents() {
        const response = await fetch(`${BASE_URL}/events`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('Failed to fetch events from grid.');
        return response.json();
    },

    /**
     * Creates a new team in the database.
     * UPDATED: Added strict validation to prevent "undefined" event_id injection.
     */
    async createTeam(eventId, teamName) {
        // --- IRONCLAD VALIDATION GATE ---
        if (!eventId || String(eventId) === "undefined" || String(eventId).trim() === "") {
            console.error("CRITICAL: Attempted to create team with invalid eventId:", eventId);
            throw new Error('Logic Error: Event selection was lost. Please re-select the event.');
        }

        const response = await fetch(`${BASE_URL}/teams`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ 
                event_id: String(eventId), 
                team_name: String(teamName) 
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail?.[0]?.msg || err.detail || 'Team creation failed.');
        }
        return response.json(); 
    },

    /**
     * Registers a participant and calculates status.
     * UPDATED: Added strict validation to prevent corrupting the participants collection.
     */
    async registerParticipant(participantData) {
        // --- IRONCLAD VALIDATION GATE ---
        if (!participantData.event_id || String(participantData.event_id) === "undefined") {
            console.error("CRITICAL: Registration payload missing valid event_id:", participantData);
            throw new Error('Logic Error: The event ID was corrupted. Registration aborted to prevent database desync.');
        }

        const response = await fetch(`${BASE_URL}/participants`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(participantData) 
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail?.[0]?.msg || err.detail || 'Registration failed.');
        }
        return response.json();
    },

    /**
     * Logs a QR check-in to the backend attendance ledger.
     */
    async logAttendanceScan(scanData) {
        const response = await fetch(`${BASE_URL}/attendance/scan`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(scanData)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Check-in rejected by grid.');
        }
        return response.json();
    },

    // -----------------------------------------------------------------
    // AUTHENTICATION & USERS
    // -----------------------------------------------------------------

    /**
     * Syncs Firebase Auth users to the Render database.
     */
    async syncUser(uid, email, role, assignedEvent = "") {
        const response = await fetch(`${BASE_URL}/users/sync`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ 
                uid: String(uid), 
                email: String(email).toLowerCase(), // Force lowercase sync
                role: String(role), 
                assigned_event: assignedEvent || "" 
            })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail?.[0]?.msg || err.detail || 'User sync failed.');
        }
        return response.json();
    },

    // -----------------------------------------------------------------
    // SECURITY & SYSTEM
    // -----------------------------------------------------------------

    async getServerTime() {
        const response = await fetch(`${BASE_URL}/system/time`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('Failed to synchronize with server clock.');
        return response.json(); 
    },

    // -----------------------------------------------------------------
    // DASHBOARD OPERATIONS (ADMIN & VOLUNTEER CRUD)
    // -----------------------------------------------------------------

    async fetchEventRoster(eventId) {
        const response = await fetch(`${BASE_URL}/admin/events/${eventId}/roster`, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('Unauthorized: Roster access denied.');
        return response.json();
    },

    /**
     * Registers a new volunteer node via Admin SDK.
     */
    async registerVolunteer(volunteerData) {
        const response = await fetch(`${BASE_URL}/admin/volunteers`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(volunteerData)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Volunteer authorization failed.');
        }
        return response.json();
    },

    /**
     * PHASE 3: UPDATE (PATCH)
     * Securely updates a participant's data via backend Admin SDK.
     */
    async updateParticipantData(participantId, updatedPayload) {
        const response = await fetch(`${BASE_URL}/admin/participants/${participantId}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(updatedPayload)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to update node data.');
        }
        return response.json();
    },

    /**
     * PHASE 3: DELETE
     * Securely deletes a participant node via backend Admin SDK.
     */
    async removeParticipant(participantId) {
        const response = await fetch(`${BASE_URL}/admin/participants/${participantId}`, {
            method: 'DELETE',
            headers: { 
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to revoke node access.');
        }
        return response.json();
    }
};