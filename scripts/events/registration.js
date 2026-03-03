// scripts/events/registration.js
import { apiClient } from '../api/api-client.js';
import { auth } from '../auth/firebase-config.js';
import { createUserWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let availableEvents = {}; 

document.addEventListener('DOMContentLoaded', async () => {
    const eventSelect = document.getElementById('event_id');
    const teamSection = document.getElementById('team-section');
    const createTeamUI = document.getElementById('create-team-ui');
    const joinTeamUI = document.getElementById('join-team-ui');
    const form = document.getElementById('register-form');
    const externalCheckbox = document.getElementById('is_external');
    const uniWrapper = document.getElementById('university-name-wrapper');

    // 1. Fetch Events - THE AUTO-SYNTHESIZE FIX
    try {
        const eventsList = await apiClient.fetchEvents();
        eventSelect.innerHTML = '<option value="">-- Select Target Event --</option>';
        
        eventsList.forEach(ev => {
            // If the backend forgets the ID, we generate it automatically.
            // "CodeShield" becomes "event_codeshield", "Cyber Canvas" becomes "event_cybercanvas"
            let trueEventId = ev.event_id || ev.eventId || ev.id;
            if (!trueEventId) {
                trueEventId = "event_" + String(ev.event_name || ev.name).toLowerCase().replace(/[^a-z0-9]/g, '');
            }
            
            const trueEventName = ev.event_name || ev.name || "Unknown Event";
            
            availableEvents[trueEventId] = ev; 
            eventSelect.innerHTML += `<option value="${trueEventId}">${trueEventName} (Max: ${ev.max_team_size || 1})</option>`;
        });
        console.log("Grid Sync: Events Loaded and IDs Synthesized.", availableEvents);
    } catch (error) {
        console.error("Event fetch error:", error);
    }

    // 2. UI Visibility Logic (Team UI will now trigger properly)
    eventSelect.addEventListener('change', (e) => {
        const selectedEvent = availableEvents[e.target.value];
        // Safely check max_team_size
        if (selectedEvent && parseInt(selectedEvent.max_team_size || 1) > 1) {
            teamSection.style.display = 'block';
            
            // Auto-select "Create" view if neither is checked
            const currentOption = document.querySelector('input[name="team_option"]:checked');
            if (!currentOption) {
                document.querySelector('input[value="create"]').checked = true;
                createTeamUI.style.display = 'block';
                joinTeamUI.style.display = 'none';
            }
        } else {
            teamSection.style.display = 'none';
        }
    });

    const radioOptions = document.getElementsByName('team_option');
    radioOptions.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'create') {
                createTeamUI.style.display = 'block';
                joinTeamUI.style.display = 'none';
            } else {
                createTeamUI.style.display = 'none';
                joinTeamUI.style.display = 'block';
            }
        });
    });

    if(externalCheckbox) {
        externalCheckbox.addEventListener('change', (e) => {
            uniWrapper.style.display = e.target.checked ? 'block' : 'none';
        });
    }

    // 3. The Ironclad Registration Pipeline
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-btn');

        // Extract the synthesized, valid ID from the DOM
        const FINAL_EVENT_ID = String(document.getElementById('event_id').value).trim();
        
        // The safety lock that caught the bug
        if (!FINAL_EVENT_ID || FINAL_EVENT_ID === "" || FINAL_EVENT_ID === "undefined") {
            alert("CRITICAL ERROR: Invalid Event Selection. Please refresh the page.");
            return;
        }

        let registrationData = {
            event_id: FINAL_EVENT_ID, 
            full_name: document.getElementById('full_name').value,
            gmail: document.getElementById('gmail').value.toLowerCase().trim(),
            enrollment_number: document.getElementById('enrollment_number').value,
            department: document.getElementById('department').value,
            academic_year: document.getElementById('academic_year').value,
            contact_number: document.getElementById('contact_number').value,
            is_external: document.getElementById('is_external').checked,
            university_name: document.getElementById('is_external').checked ? document.getElementById('university_name').value : "UEM Kolkata"
        };

        submitBtn.disabled = true;
        submitBtn.innerText = 'FORGING IDENTITY...';

        let createdUser = null;
        let finalTeamId = "INDIVIDUAL";

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, registrationData.gmail, document.getElementById('password').value);
            createdUser = userCredential.user;

            await apiClient.syncUser(createdUser.uid, registrationData.gmail, "Participant", null);

            const selectedEvent = availableEvents[FINAL_EVENT_ID];
            if (selectedEvent && parseInt(selectedEvent.max_team_size || 1) > 1) {
                const teamOption = document.querySelector('input[name="team_option"]:checked').value;
                if (teamOption === 'create') {
                    submitBtn.innerText = 'GENERATING TEAM...';
                    const teamName = document.getElementById('team_name').value;
                    const teamData = await apiClient.createTeam(FINAL_EVENT_ID, teamName);
                    finalTeamId = teamData.team_id;
                    alert(`Team Created! ID: ${finalTeamId}`);
                } else {
                    finalTeamId = document.getElementById('team_id').value;
                }
            }

            registrationData.team_id = finalTeamId;

            submitBtn.innerText = 'FINALIZING...';
            await apiClient.registerParticipant(registrationData);
            
            sessionStorage.setItem('userRole', 'Participant');
            window.location.href = '../participant/digital-id.html'; 

        } catch (error) {
            console.error("Pipeline Failure:", error);
            if (createdUser) await deleteUser(createdUser);
            alert(`Registration Failed: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'COMPLETE REGISTRATION';
        }
    });
});