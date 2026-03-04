// scripts/events/registration.js
import { apiClient } from '../api/api-client.js';
import { auth } from '../auth/firebase-config.js';
import { createUserWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Populated once events load from the backend.
// Used by the change listener to look up max_team_size dynamically.
let availableEvents = {};

document.addEventListener('DOMContentLoaded', async () => {
    const eventSelect   = document.getElementById('event_id');
    const teamSection   = document.getElementById('team-section');
    const createTeamUI  = document.getElementById('create-team-ui');
    const joinTeamUI    = document.getElementById('join-team-ui');
    const form          = document.getElementById('register-form');
    const submitBtn     = document.getElementById('submit-btn');

    // =========================================================
    // 1. FETCH EVENTS — with loading state & fallback feedback
    // =========================================================
    // Show a loading state while we wake up the Render backend
    // (free-tier cold starts can take up to 30 seconds).
    eventSelect.innerHTML = '<option value="" disabled selected>Loading events...</option>';
    eventSelect.disabled  = true;

    try {
        const eventsList = await apiClient.fetchEvents();

        // Wipe the loading placeholder and rebuild the list
        eventSelect.innerHTML = '<option value="" disabled selected>-- Select Target Event --</option>';

        eventsList.forEach(ev => {
            // Prefer the stored event_id field; fall back to the document ID.
            // This handles events like event_guest_lecture that the backend returns
            // with ev.event_id === "event_guest_lecture" AND ev.id === "event_guest_lecture".
            const trueEventId = ev.event_id || ev.id;

            if (!trueEventId) {
                console.warn("Skipping event with no resolvable ID:", ev);
                return;
            }

            const trueEventName = ev.name || ev.event_name || "Unknown Event";
            const maxSize       = ev.max_team_size || 1;

            availableEvents[trueEventId] = ev;

            const opt   = document.createElement('option');
            opt.value   = trueEventId;
            opt.textContent = `${trueEventName} (Max: ${maxSize})`;
            eventSelect.appendChild(opt);
        });

        console.log("Grid Sync: Events loaded →", Object.keys(availableEvents));

    } catch (err) {
        // API unreachable (Render sleeping / network issue).
        // Restore the hardcoded fallback list so the form is still usable,
        // and inform the user to refresh if their event is missing.
        console.error("Event fetch failed — using hardcoded fallback:", err);

        eventSelect.innerHTML = `
            <option value="" disabled selected>-- Select Target Event --</option>
            <option value="event_codeshield">CodeShield (7-Hour Hackathon)</option>
            <option value="event_packet_hijackers">Packet Hijackers (CTF)</option>
            <option value="event_cyber_visionary">Cyber Visionary (Ideathon)</option>
            <option value="event_digital_dilemma">Digital Dilemma (Tech Debate)</option>
            <option value="event_cyber_canvas">Cyber Canvas (Poster Gallery)</option>
            <option value="event_guest_lecture">Guest Lecture</option>
        `;

        // Show a non-blocking warning banner beneath the select
        const warn = document.createElement('p');
        warn.style.cssText = 'color:#f0ad4e;font-size:0.8rem;margin-top:4px;';
        warn.textContent   = '⚠ Could not reach the server. If your event is missing, wait a moment and refresh.';
        eventSelect.parentNode.appendChild(warn);
    } finally {
        eventSelect.disabled = false;
    }


    // =========================================================
    // 2. TEAM SECTION TOGGLE
    //    Single authoritative listener — uses availableEvents for
    //    dynamic events, falls back to a hardcoded set for the
    //    offline fallback list above.
    // =========================================================
    const KNOWN_MULTI_EVENTS = new Set([
        'event_codeshield',
        'event_packet_hijackers',
        'event_cyber_visionary',
        'event_digital_dilemma',
    ]);

    eventSelect.addEventListener('change', (e) => {
        const selectedId    = e.target.value;
        const eventData     = availableEvents[selectedId];

        // Use dynamic data when available; fall back to the hardcoded set.
        const isMultiMember = eventData
            ? parseInt(eventData.max_team_size || 1) > 1
            : KNOWN_MULTI_EVENTS.has(selectedId);

        if (isMultiMember) {
            teamSection.style.display = 'block';
            // Default to "Create" if nothing is checked yet
            if (!document.querySelector('input[name="team_option"]:checked')) {
                document.querySelector('input[value="create"]').checked = true;
            }
            createTeamUI.style.display = 'block';
            joinTeamUI.style.display   = 'none';
        } else {
            teamSection.style.display = 'none';
        }
    });

    // Create vs Join sub-toggle
    document.getElementsByName('team_option').forEach(radio => {
        radio.addEventListener('change', (e) => {
            createTeamUI.style.display = e.target.value === 'create' ? 'block' : 'none';
            joinTeamUI.style.display   = e.target.value === 'join'   ? 'block' : 'none';
        });
    });

    // External-college checkbox → show/hide university name field
    const externalCheckbox = document.getElementById('is_external');
    const uniWrapper       = document.getElementById('university-name-wrapper');
    const uniInput         = document.getElementById('university_name');

    if (externalCheckbox) {
        externalCheckbox.addEventListener('change', (e) => {
            uniWrapper.style.display = 'block';
            if (e.target.checked) {
                uniInput.value       = '';
                uniInput.placeholder = 'Enter your College/University name';
                uniInput.required    = true;
            } else {
                uniInput.value    = 'University of Engineering & Management, Kolkata';
                uniInput.required = false;
            }
        });
    }


    // =========================================================
    // 3. REGISTRATION PIPELINE
    //
    //    FIX: Corrected operation order to eliminate the "vanish"
    //    race condition.
    //
    //    OLD (broken) order:
    //      Auth → syncUser → team → registerParticipant
    //
    //    If registerParticipant timed out on the client but the
    //    server still wrote to Firestore, deleteUser() would
    //    destroy the Auth account. The next retry would then
    //    hit "email already registered" and the user was stuck.
    //
    //    NEW (correct) order:
    //      Auth → team → registerParticipant → syncUser
    //
    //    syncUser is now the last step. It is non-fatal: losing
    //    it just means the user's role isn't in the users
    //    collection yet, which is recoverable on next login.
    //
    //    The catch also detects "already registered" errors,
    //    which indicate a prior server-side success + client
    //    timeout. In that case we do NOT delete the Auth account
    //    and instead proceed directly to the Digital ID page.
    // =========================================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const FINAL_EVENT_ID = String(eventSelect.value).trim();

        if (!FINAL_EVENT_ID || FINAL_EVENT_ID === 'undefined') {
            alert('CRITICAL ERROR: Invalid event selection. Please refresh and try again.');
            return;
        }

        const registrationData = {
            event_id:          FINAL_EVENT_ID,
            full_name:         document.getElementById('full_name').value.trim(),
            gmail:             document.getElementById('gmail').value.toLowerCase().trim(),
            enrollment_number: document.getElementById('enrollment_number').value.trim(),
            department:        document.getElementById('department').value.trim(),
            academic_year:     document.getElementById('academic_year').value,
            contact_number:    document.getElementById('contact_number').value.trim(),
            is_external:       document.getElementById('is_external').checked,
            university_name:   document.getElementById('is_external').checked
                                   ? document.getElementById('university_name').value.trim()
                                   : 'UEM Kolkata',
            // NOTE: password is intentionally NOT included here.
            // The backend only needs it when a volunteer registers a participant
            // manually. For this public flow, Firebase Auth is handled client-side.
        };

        submitBtn.disabled  = true;
        submitBtn.innerText = 'FORGING IDENTITY...';

        let createdUser  = null;
        let finalTeamId  = 'INDIVIDUAL';

        try {
            // STEP 1 — Create Firebase Auth account
            const userCredential = await createUserWithEmailAndPassword(
                auth,
                registrationData.gmail,
                document.getElementById('password').value
            );
            createdUser = userCredential.user;

            // STEP 2 — Handle team creation / joining (multi-member events only)
            const selectedEvent = availableEvents[FINAL_EVENT_ID];
            const isMultiMember = selectedEvent
                ? parseInt(selectedEvent.max_team_size || 1) > 1
                : KNOWN_MULTI_EVENTS.has(FINAL_EVENT_ID);

            if (isMultiMember) {
                const teamOption = document.querySelector('input[name="team_option"]:checked').value;

                if (teamOption === 'create') {
                    submitBtn.innerText   = 'GENERATING TEAM...';
                    const teamName        = document.getElementById('team_name').value.trim();
                    const teamData        = await apiClient.createTeam(FINAL_EVENT_ID, teamName);
                    finalTeamId           = teamData.team_id;
                    alert(`Team Created! Your Team ID is: ${finalTeamId}\nShare this with your teammates.`);
                } else {
                    finalTeamId = document.getElementById('team_id').value.trim();
                }
            }

            registrationData.team_id = finalTeamId;

            // STEP 3 — Register participant in Firestore via backend
            // This is the critical write. We do it BEFORE syncUser so that if
            // this succeeds but syncUser fails, the participant record is safe.
            submitBtn.innerText = 'FINALIZING NODE...';
            await apiClient.registerParticipant(registrationData);

            // STEP 4 — Sync user role to the users collection (non-fatal)
            // If this fails the participant is still registered; they just won't
            // have a role doc until their first login triggers a re-sync.
            try {
                await apiClient.syncUser(
                    createdUser.uid,
                    registrationData.gmail,
                    'Participant',
                    FINAL_EVENT_ID
                );
            } catch (syncErr) {
                console.warn('[NON-FATAL] User sync failed. Will retry on next login.', syncErr);
            }

            // SUCCESS — redirect to Digital ID page
            sessionStorage.setItem('userRole', 'Participant');
            window.location.href = '../participant/digital-id.html';

        } catch (error) {
            console.error('Pipeline Failure:', error);

            const isAlreadyRegistered = error.message &&
                error.message.toLowerCase().includes('already registered');

            if (isAlreadyRegistered && createdUser) {
                // This means a previous attempt hit a client-side timeout but the
                // server DID write the participant doc to Firestore. The Auth account
                // we just created is valid — sync the role and proceed.
                console.warn('[RECOVERY] Participant record exists from a prior attempt. Syncing role and redirecting.');
                try {
                    await apiClient.syncUser(
                        createdUser.uid,
                        registrationData.gmail,
                        'Participant',
                        FINAL_EVENT_ID
                    );
                } catch (_) { /* non-fatal */ }

                sessionStorage.setItem('userRole', 'Participant');
                window.location.href = '../participant/digital-id.html';
                return;
            }

            // Genuine failure — clean up the Auth account so the user can retry cleanly.
            if (createdUser) {
                await deleteUser(createdUser).catch(cleanupErr =>
                    console.warn('Auth cleanup failed (non-fatal):', cleanupErr)
                );
            }

            alert(`Registration Failed: ${error.message}`);

        } finally {
            submitBtn.disabled  = false;
            submitBtn.innerText = 'INITIALIZE REGISTRATION';
        }
    });
});