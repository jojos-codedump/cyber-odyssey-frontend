import { apiClient } from '../api/api-client.js';

export class BracketRenderer {
    constructor(containerId, eventId, isVolunteer = false) {
        this.container = document.getElementById(containerId);
        this.eventId = eventId;
        this.isVolunteer = isVolunteer;
        this.bracketData = [];
    }

    async initialize() {
        try {
            this.container.innerHTML = '<p style="color: #00ffcc;">Syncing bracket tree with server...</p>';
            this.bracketData = await apiClient.generateEventBracket(this.eventId);
            this.render();
        } catch (error) {
            this.container.innerHTML = `<p style="color: #ff4444;">Sync Error: ${error.message}</p>`;
        }
    }

    render() {
        this.container.innerHTML = '';
        this.container.className = 'tournament-bracket';

        this.bracketData.forEach((round, roundIndex) => {
            const roundDiv = document.createElement('div');
            roundDiv.className = `bracket-round round-${roundIndex + 1}`;
            
            const roundHeader = document.createElement('h3');
            roundHeader.innerText = this.getRoundName(this.bracketData.length, roundIndex);
            roundDiv.appendChild(roundHeader);

            round.forEach((match, matchIndex) => {
                const matchDiv = document.createElement('div');
                matchDiv.className = 'bracket-match';
                
                const p1 = this.createParticipantNode(match.participant1, roundIndex, matchIndex, 1);
                const p2 = this.createParticipantNode(match.participant2, roundIndex, matchIndex, 2);
                
                matchDiv.appendChild(p1);
                matchDiv.appendChild(p2);
                roundDiv.appendChild(matchDiv);
            });

            this.container.appendChild(roundDiv);
        });
    }

    createParticipantNode(participant, roundIndex, matchIndex, playerSlot) {
        const node = document.createElement('div');
        node.className = `participant ${participant && participant.isWinner ? 'winner' : ''}`;

        if (!participant || participant.id === 'bye') {
            node.innerText = "BYE";
            node.classList.add('bye-node');
        } else {
            node.innerText = participant.name;
            node.dataset.id = participant.id;
            
            if (this.isVolunteer && !participant.isWinner) {
                node.style.cursor = 'pointer';
                node.onclick = () => this.advanceParticipant(participant, roundIndex, matchIndex);
            }
        }
        return node;
    }

    async advanceParticipant(participant, roundIndex, matchIndex) {
        const isFinalRound = roundIndex === this.bracketData.length - 1;
        
        if (isFinalRound) {
            this.triggerWinningAnimation(participant.name);
        }

        try {
            // Push mutation to backend so the winner is saved globally [cite: 408]
            await apiClient.updateBracketNode(this.eventId, {
                round_index: roundIndex,
                match_index: matchIndex,
                winner_id: participant.id
            });

            // Re-fetch fresh data to ensure UI matches database state
            this.bracketData = await apiClient.generateEventBracket(this.eventId);
            this.render();
        } catch (error) {
            alert(`Failed to advance participant: ${error.message}`);
        }
    }

    triggerWinningAnimation(winnerName) {
        const overlay = document.createElement('div');
        overlay.className = 'winner-overlay';
        overlay.innerHTML = `
            <div class="winner-card glitch-text" data-text="CHAMPION">
                <h1>CHAMPION</h1>
                <h2>${winnerName}</h2>
                <p>GRID SECURED</p>
                <button onclick="this.parentElement.parentElement.remove()" class="btn-primary">CLOSE</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    getRoundName(totalRounds, currentRound) {
        const remainingRounds = totalRounds - currentRound;
        if (remainingRounds === 1) return "Finals";
        if (remainingRounds === 2) return "Semi-Finals";
        if (remainingRounds === 3) return "Quarter-Finals";
        return `Round ${currentRound + 1}`;
    }
}