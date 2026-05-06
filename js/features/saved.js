import state from '../core/state.js';
import { showSection, saveTrips, toast } from '../core/utils.js';
import { renderItinerary, renderTripSummaryCard, renderPackingSuggestions } from './planner.js';

export function saveCurrentTrip() {
    if (!state.currentTrip) { toast('No trip to save'); return; }
    state.savedTrips.unshift(state.currentTrip);
    saveTrips();
    toast('Trip saved ✓');
}

export function showSavedTrips() {
    showSection('saved-section');
    const grid = document.getElementById('saved-grid');

    if (state.savedTrips.length === 0) {
        grid.innerHTML = '<p class="empty-state">No saved trips yet.</p>';
        return;
    }

    grid.innerHTML = state.savedTrips.map((trip, i) => `
        <div class="saved-card" data-idx="${i}">
            <div class="saved-header">
                <span class="saved-dest">${trip.destination}</span>
                <span class="saved-date">${new Date(trip.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="saved-meta">
                <span>${trip.days} days</span>
                <span>${trip.budget}</span>
                <span>${trip.travelers}</span>
            </div>
        </div>
    `).join('');

    // Add click handlers to load saved trips
    grid.querySelectorAll('.saved-card').forEach(card => {
        card.addEventListener('click', () => {
            const idx = parseInt(card.dataset.idx);
            loadSavedTrip(idx);
        });
    });
}

function loadSavedTrip(idx) {
    const trip = state.savedTrips[idx];
    if (!trip) return;

    // Restore as current trip
    state.currentTrip = trip;
    state.destination = trip.destination;
    state.days = String(trip.days);
    state.budget = trip.budget;
    state.travelers = trip.travelers;
    state.interests = trip.interests || [];

    // Show itinerary section
    showSection('itinerary-section');

    // Hide loading state
    const loading = document.getElementById('loading-state');
    loading.classList.remove('visible');

    // Clear and render
    const daysContainer = document.getElementById('itinerary-days');
    const summaryContainer = document.getElementById('trip-summary');
    daysContainer.innerHTML = '';
    summaryContainer.innerHTML = '';

    renderItinerary(trip.itinerary, trip.currency);
    renderTripSummaryCard(trip.itinerary, trip.currency, trip.weather);
    renderPackingSuggestions(trip.weather);
}

export function copyTrip() {
    if (!state.currentTrip) return;
    const trip = state.currentTrip;
    let text = `${trip.destination} — ${trip.days} Day Itinerary\n${'='.repeat(40)}\n\n`;
    trip.itinerary.forEach(day => {
        text += `Day ${day.day}: ${day.title}\n`;
        ['morning', 'afternoon', 'evening'].forEach(slot => {
            if (day[slot]) text += `  ${slot}: ${day[slot].activity} @ ${day[slot].location} (${day[slot].duration}, ${day[slot].cost})\n`;
        });
        if (day.transport) text += `  Transport: ${day.transport}\n`;
        if (day.food_rec) text += `  Food: ${day.food_rec}\n`;
        text += '\n';
    });
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'));
}

export function printTrip() {
    if (!state.currentTrip) return;
    const content = document.getElementById('itinerary-days').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${state.currentTrip.destination}</title><style>body{font-family:Inter,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#222}h1{margin-bottom:20px}.day-card{margin-bottom:24px;padding:16px;border:1px solid #ddd;border-radius:8px}.day-header{font-weight:700;margin-bottom:12px;font-size:16px}.time-slot{margin-bottom:8px;padding-left:16px}.slot-activity{font-weight:600}.slot-tip{color:#666;font-size:12px;font-style:italic}.day-footer{margin-top:12px;font-size:12px;color:#666}</style></head><body><h1>${state.currentTrip.destination} — ${state.currentTrip.days} Days</h1>${content}</body></html>`);
    win.document.close();
    win.print();
}
