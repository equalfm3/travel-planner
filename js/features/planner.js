/**
 * Trip planner — multi-step deterministic approach
 * Each aspect is asked separately for reliability
 */
import state from '../core/state.js';
import { queryOllama } from '../core/ollama.js';
import { geocode, getWeather } from '../core/apis.js';
import { showSection, parseJSON, toast } from '../core/utils.js';

let currency_symbol = '€';

export async function generateTrip() {
    const dest = document.getElementById('destination-input').value.trim();
    if (!dest) { toast('Enter a destination'); return; }

    state.destination = dest;
    state.origin = document.getElementById('origin-input')?.value.trim() || '';
    state.notes = document.getElementById('notes-input')?.value.trim() || '';

    showSection('itinerary-section');
    const loading = document.getElementById('loading-state');
    const loadingText = document.getElementById('loading-text');
    const daysContainer = document.getElementById('itinerary-days');
    const summaryContainer = document.getElementById('trip-summary');
    const infoSection = document.getElementById('info-section');
    const infoCards = document.getElementById('info-cards');

    loading.classList.add('visible');
    daysContainer.innerHTML = '';
    summaryContainer.innerHTML = '';

    const days = parseInt(state.days);

    // ─── Step 0: Geo + Weather (API) + Currency (AI) ───
    loadingText.textContent = 'Finding destination...';
    const geo = await geocode(dest);
    let weather = null;
    if (geo) weather = await getWeather(geo.lat, geo.lon, days);

    // Ask AI for currency (static knowledge, no API needed)
    loadingText.textContent = 'Getting local info...';
    const currencyResponse = await queryOllama(
        `What currency is used in ${dest}? Reply with ONLY two things separated by a pipe: currency code | symbol. Example: EUR | €. Nothing else.`
    );
    const currParts = currencyResponse.split('|').map(s => s.trim());
    const currency = { code: currParts[0] || 'EUR', symbol: currParts[1] || '€' };
    currency_symbol = currency.symbol;

    // Show info cards
    document.getElementById('info-title').textContent = dest;
    infoCards.innerHTML = `
        <div class="info-card"><i class="ph ph-map-pin"></i><span class="info-value">${geo ? geo.display.split(',').slice(0, 2).join(',') : dest}</span><span class="info-label">Location</span></div>
        <div class="info-card"><i class="ph ph-currency-dollar"></i><span class="info-value">${currency.code} (${currency.symbol})</span><span class="info-label">Currency</span></div>
        ${weather ? `<div class="info-card"><i class="ph ph-thermometer"></i><span class="info-value">${Math.round(weather[0]?.tempMax)}° / ${Math.round(weather[0]?.tempMin)}°</span><span class="info-label">Forecast</span></div>` : ''}
        <div class="info-card"><i class="ph ph-calendar"></i><span class="info-value">${days} days</span><span class="info-label">Duration</span></div>
    `;
    infoSection.classList.add('visible');

    // ─── Step 1: Route (which cities each day) ───
    loadingText.textContent = 'Planning route...';
    const route = await askRoute(dest, days);

    // ─── Step 2: Build each day ───
    const itinerary = [];
    const previousActivities = []; // Track what's been suggested to avoid repetition

    for (let i = 0; i < route.length; i++) {
        const dayCity = route[i];
        const dayNum = i + 1;
        loadingText.textContent = `Day ${dayNum}/${days}: Planning ${dayCity}...`;

        const dayData = { day: dayNum, location: dayCity, title: '' };

        // Activities
        const isLastDay = (dayNum === days) && state.origin;
        const activities = await askActivities(dayCity, dayNum, days, isLastDay, previousActivities);
        dayData.title = activities.title || dayCity;
        dayData.morning = activities.morning;
        dayData.afternoon = activities.afternoon;
        dayData.evening = activities.evening;

        // Track activities to avoid repetition
        if (activities.morning) previousActivities.push(activities.morning.activity);
        if (activities.afternoon) previousActivities.push(activities.afternoon.activity);
        if (activities.evening) previousActivities.push(activities.evening.activity);

        // Restaurant
        loadingText.textContent = `Day ${dayNum}/${days}: Finding restaurants in ${dayCity}...`;
        dayData.food_rec = await askRestaurant(dayCity);

        // Hotel (skip last day if returning, reuse if same city as yesterday)
        if (!isLastDay) {
            if (i > 0 && route[i] === route[i - 1] && itinerary[i - 1]?.accommodation) {
                // Same city as yesterday — reuse hotel
                dayData.accommodation = itinerary[i - 1].accommodation;
            } else {
                loadingText.textContent = `Day ${dayNum}/${days}: Finding accommodation in ${dayCity}...`;
                dayData.accommodation = await askHotel(dayCity);
            }
        }

        // Transport between cities (only when changing base, not day trips)
        if (i < route.length - 1 && route[i] !== route[i + 1]) {
            loadingText.textContent = `Day ${dayNum}: Transport ${dayCity} → ${route[i + 1]}...`;
            dayData.inter_city_transport = await askTransport(dayCity, route[i + 1]);
        }

        // Day 1: getting there
        if (dayNum === 1 && state.origin) {
            loadingText.textContent = 'Finding transport from ' + state.origin + '...';
            dayData.getting_there = await askTransport(state.origin, dayCity);
        }

        // Last day: return
        if (isLastDay) {
            loadingText.textContent = 'Finding return transport...';
            dayData.return_trip = await askTransport(dayCity, state.origin);
        }

        // Weather
        if (weather && weather[i]) {
            dayData.weather = weather[i];
        }

        itinerary.push(dayData);

        // Live render as we go
        renderItinerary(itinerary, currency);
    }

    state.currentTrip = { destination: dest, days, budget: state.budget, travelers: state.travelers, interests: state.interests, itinerary, weather, currency, createdAt: Date.now() };
    loading.classList.remove('visible');
    renderItinerary(itinerary, currency);
    renderTripSummaryCard(itinerary, currency, weather);
    renderPackingSuggestions(weather);
    renderSummary(itinerary, currency);
}

// ─── Regenerate Day ────────────────────────────────────────────────────────

export async function regenerateDay(dayIndex) {
    if (!state.currentTrip) return;

    const { itinerary, currency } = state.currentTrip;
    const dayData = itinerary[dayIndex];
    if (!dayData) return;

    const btn = document.querySelector(`[data-regen-day="${dayIndex}"]`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner"></i> Regenerating...';
    }

    try {
        // Gather previous activities from other days to avoid repetition
        const previousActivities = [];
        itinerary.forEach((d, i) => {
            if (i !== dayIndex) {
                if (d.morning) previousActivities.push(d.morning.activity);
                if (d.afternoon) previousActivities.push(d.afternoon.activity);
                if (d.evening) previousActivities.push(d.evening.activity);
            }
        });

        const isLastDay = (dayData.day === itinerary.length) && state.origin;
        const activities = await askActivities(dayData.location, dayData.day, itinerary.length, isLastDay, previousActivities);

        dayData.title = activities.title || dayData.location;
        dayData.morning = activities.morning;
        dayData.afternoon = activities.afternoon;
        dayData.evening = activities.evening;

        // Also regenerate food recommendation
        dayData.food_rec = await askRestaurant(dayData.location);

        // Re-render
        renderItinerary(itinerary, currency);
        renderTripSummaryCard(itinerary, currency, state.currentTrip.weather);
        renderPackingSuggestions(state.currentTrip.weather);
        renderSummary(itinerary, currency);
        toast('Day ' + dayData.day + ' regenerated!');
    } catch (e) {
        console.error('Regenerate failed:', e);
        toast('Regeneration failed — try again');
    }

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Regenerate day';
    }
}

// Make regenerateDay available globally for onclick handlers
window.regenerateDay = regenerateDay;

// ─── Focused AI Questions ──────────────────────────────────────────────────

async function askRoute(dest, days) {
    const radiusNote = state.radius === 'city-only'
        ? `Stay in ${dest} every single day. Do NOT visit other cities.`
        : `Use MAXIMUM 3 base cities. Stay multiple nights in each base. Do day trips from each base but always return to sleep at the base.`;

    const response = await queryOllama(
        `Plan where to SLEEP each night for a ${days}-day trip in the ${dest} region.
${radiusNote}
Travelers: ${state.travelers}. Budget: ${state.budget}.

STRICT RULES:
- Reply with EXACTLY ${days} city names separated by commas
- Use AT MOST 3 different cities total (these are where you sleep)
- Stay at least 2-3 nights in each base city
- First night and last night must be in ${dest}
- Day trips to other towns are fine but you return to your base to sleep

Example for 10 days, 3 bases: ${dest}, ${dest}, ${dest}, ${dest}, Lecce, Lecce, Lecce, Matera, Matera, ${dest}

Reply with ONLY the comma-separated list, nothing else:`
    );

    const cities = response.split(',').map(s => s.trim().replace(/^\d+[\.\)]\s*/, '').replace(/[\.\n]/g, '')).filter(s => s.length > 1);
    while (cities.length < days) cities.push(dest);
    let route = cities.slice(0, days);

    // Enforce max 3 unique bases — if more, collapse extras to the main destination
    const uniqueCities = [...new Set(route)];
    if (uniqueCities.length > 3) {
        const top3 = uniqueCities.slice(0, 3);
        route = route.map(c => top3.includes(c) ? c : dest);
    }

    // Ensure first and last are the main destination
    route[0] = dest;
    route[route.length - 1] = dest;

    return route;
}

async function askActivities(city, dayNum, totalDays, isLastDay, previousActivities = []) {
    const lastDayNote = isLastDay ? 'This is the LAST day — morning: pack and checkout. Afternoon: last walk or shopping. Evening: head to airport/station.' : '';
    const avoidNote = previousActivities.length > 0
        ? `\nDO NOT suggest any of these (already done on previous days): ${previousActivities.slice(-12).join(', ')}`
        : '';

    const response = await queryOllama(
        `You are planning day ${dayNum} of a ${totalDays}-day trip. The traveler is in ${city}.
Budget: ${state.budget}. Travelers: ${state.travelers}. Interests: ${state.interests.join(', ') || 'sightseeing, food, culture'}.
${lastDayNote}
${state.notes ? 'Notes: ' + state.notes : ''}
${avoidNote}

Give exactly 3 DIFFERENT activities (morning, afternoon, evening). Be SPECIFIC — real place names, real attractions in ${city}.

Reply in EXACTLY this format (use | as separator):
TITLE: short theme for the day (3-5 words)
MORNING: activity | specific location/address | duration like 2h | cost as plain number (0 if free) | one practical tip
AFTERNOON: activity | specific location/address | duration like 3h | cost as plain number | one practical tip
EVENING: activity | specific location/address | duration like 2h | cost as plain number | one practical tip

Do NOT leave any field empty. Do NOT use currency symbols in cost — just the number.`
    );

    return parseActivities(response);
}

async function askRestaurant(city) {
    const response = await queryOllama(
        `Recommend ONE specific restaurant in ${city} for ${state.budget} budget. Reply with ONLY: restaurant name, dish to try. Example: Trattoria da Mario, try the orecchiette con cime di rapa`
    );
    return response.trim().slice(0, 100);
}

async function askHotel(city) {
    const response = await queryOllama(
        `Recommend ONE specific hotel/accommodation in ${city} for ${state.budget} budget.
Reply in this EXACT format (one line):
name | neighborhood | price per night as number only
Example: Hotel Palazzo Fizzo | Bari Vecchia | 120`
    );
    return parseHotel(response);
}

async function askTransport(from, to) {
    const response = await queryOllama(
        `Travel options from ${from} to ${to}. Give exactly 3 options.

Write EXACTLY 3 lines, each in this pipe-separated format:
Transport mode | Total duration (like 2h30 or 12h) | Price in euros (just numbers like 80-150) | Company name

Example output:
Flight | 2h30 | 80-150 | Ryanair direct
Train | 9h | 50-90 | Trenitalia via Milan
Bus | 14h | 30-55 | FlixBus with 1 change

RULES:
- Duration MUST start with a number (e.g. 2h30, not just h30)
- Price MUST be numbers only (e.g. 80-150, not €80-150)
- Give exactly 3 lines, no headers, no explanations`
    );
    console.log(`Transport ${from} → ${to}:`, response);
    return parseTransport(response);
}

// ─── Parsers ───────────────────────────────────────────────────────────────

function cleanCost(text) {
    if (!text) return '0';
    const cleaned = text.replace(/free/i, '0');
    const match = cleaned.match(/(\d+(?:\s*[-–]\s*\d+)?)/);
    return match ? match[1].replace(/\s/g, '') : '0';
}

function parseActivities(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const result = { title: '', morning: null, afternoon: null, evening: null };

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith('title:')) {
            result.title = line.replace(/^title:\s*/i, '').trim();
        } else if (lower.startsWith('morning:')) {
            result.morning = parseSlot(line.replace(/^morning:\s*/i, ''));
        } else if (lower.startsWith('afternoon:')) {
            result.afternoon = parseSlot(line.replace(/^afternoon:\s*/i, ''));
        } else if (lower.startsWith('evening:')) {
            result.evening = parseSlot(line.replace(/^evening:\s*/i, ''));
        }
    }

    // Detect garbled/hallucinated output
    const allText = JSON.stringify(result);
    if (/[\u4e00-\u9fff\u0400-\u04ff]/.test(allText)) {
        return { title: result.title || 'Exploration Day', morning: result.morning?.activity && !/[\u4e00-\u9fff]/.test(result.morning.activity) ? result.morning : { activity: 'Explore the city center', location: 'City center', duration: '2h', cost: '0', tip: 'Wear comfortable shoes' }, afternoon: result.afternoon?.activity && !/[\u4e00-\u9fff]/.test(result.afternoon.activity) ? result.afternoon : { activity: 'Visit local museum or landmark', location: 'Main square', duration: '3h', cost: '5', tip: 'Check opening hours' }, evening: result.evening?.activity && !/[\u4e00-\u9fff]/.test(result.evening.activity) ? result.evening : { activity: 'Dinner at local restaurant', location: 'City center', duration: '2h', cost: '40', tip: 'Make a reservation' } };
    }

    return result;
}

function parseSlot(text) {
    const parts = text.split('|').map(s => s.trim());
    return {
        activity: parts[0] || 'Explore the area',
        location: parts[1] || '',
        duration: parts[2] || '2h',
        cost: cleanCost(parts[3]),
        tip: parts[4] || '',
    };
}

function parseHotel(text) {
    const parts = text.split('|').map(s => s.trim());
    if (parts.length < 2) {
        const nums = text.match(/\d+/);
        return { name: text.slice(0, 50), neighborhood: '', price_night: nums ? nums[0] : '80' };
    }
    return {
        name: parts[0] || 'Hotel',
        neighborhood: parts[1] || '',
        price_night: (parts[2] || '80').replace(/[^0-9]/g, '') || '80',
    };
}

function parseTransport(text) {
    const lines = text.split('\n').filter(l => l.trim() && !l.includes('---') && !/^(transport|here|example|mode)/i.test(l.trim()));
    const options = [];

    for (const line of lines.slice(0, 3)) {
        const parts = line.split('|').map(s => s.trim().replace(/^[-*•)\s]+/, ''));
        if (parts.length >= 3 && parts[0].length > 1) {
            options.push({
                mode: parts[0],
                duration: cleanDuration(parts[1]),
                cost: cleanCost(parts[2]),
                details: parts[3] || '',
            });
        }
    }

    if (options.length === 0) {
        const fallbackLines = text.split('\n').filter(l => /flight|train|bus|drive|car/i.test(l)).slice(0, 3);
        for (const line of fallbackLines) {
            const mode = (line.match(/(flight|train|bus|car|drive)/i) || ['Transport'])[0];
            options.push({ mode, duration: cleanDuration(line), cost: cleanCost(line), details: '' });
        }
    }

    return options.length > 0 ? options : [{ mode: 'Check locally', duration: '', cost: '', details: '' }];
}

function cleanDuration(text) {
    if (!text) return '';
    const match = text.match(/(\d+)\s*h\s*(\d+)?/i);
    if (match) return match[2] ? `${match[1]}h${match[2]}` : `${match[1]}h`;
    const hoursMatch = text.match(/(\d+)\s*hour/i);
    if (hoursMatch) return `${hoursMatch[1]}h`;
    const minMatch = text.match(/(\d+)\s*min/i);
    if (minMatch) return `${minMatch[1]}min`;
    return text.replace(/[^0-9hm]/g, '').slice(0, 6);
}

// ─── Rendering ─────────────────────────────────────────────────────────────

function renderItinerary(itinerary, currency) {
    const container = document.getElementById('itinerary-days');

    // Render sticky day navigation
    const navHtml = `
        <nav class="day-nav" id="day-nav">
            <div class="day-nav-inner">
                ${itinerary.map((day, i) => `
                    <button class="day-nav-pill" data-day-index="${i}" onclick="document.getElementById('day-card-${i}').scrollIntoView({behavior:'smooth', block:'start'})">
                        Day ${day.day}${day.location ? ' · ' + day.location : ''}
                    </button>
                `).join('')}
            </div>
        </nav>`;

    // Render day cards
    const cardsHtml = itinerary.map((day, idx) => {
        const w = day.weather ? `<span class="day-weather">${day.weather.icon} ${Math.round(day.weather.tempMax)}°/${Math.round(day.weather.tempMin)}°</span>` : '';
        const loc = day.location ? `<span class="day-location"><i class="ph ph-map-pin"></i> ${day.location}</span>` : '';

        const gettingThere = (day.getting_there && Array.isArray(day.getting_there)) ? renderTransportPills('Getting there', 'ph-airplane-takeoff', day.getting_there) : '';
        const returnTrip = (day.return_trip && Array.isArray(day.return_trip)) ? renderTransportPills(`Return to ${state.origin}`, 'ph-airplane-landing', day.return_trip) : '';
        const interCity = (day.inter_city_transport && Array.isArray(day.inter_city_transport)) ? renderTransportPills('Next city', 'ph-arrow-right', day.inter_city_transport) : '';

        const accom = day.accommodation ? `
            <div class="day-accommodation">
                <i class="ph ph-bed"></i>
                <span class="accom-name">${day.accommodation.name}</span>
                <span class="accom-price">${currency.symbol}${day.accommodation.price_night}/night</span>
                ${day.accommodation.neighborhood ? `<span class="accom-area">${day.accommodation.neighborhood}</span>` : ''}
            </div>` : '';

        // Daily budget calculation
        const budgetLine = renderDayBudget(day, currency);

        return `
        <div class="day-card" id="day-card-${idx}">
            <div class="day-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <span class="day-number">Day ${day.day}</span>
                <span class="day-title">${day.title}</span>
                ${loc}
                ${w}
                <i class="ph ph-caret-down day-collapse-icon"></i>
            </div>
            ${gettingThere}
            <div class="day-slots">
                ${day.morning ? renderSlot('Morning', day.morning, 'ph-sun', 'slot-morning') : ''}
                ${day.afternoon ? renderSlot('Afternoon', day.afternoon, 'ph-sun-dim', 'slot-afternoon') : ''}
                ${day.evening ? renderSlot('Evening', day.evening, 'ph-moon', 'slot-evening') : ''}
            </div>
            <div class="day-footer">
                ${accom}
                ${day.food_rec ? `<span class="day-meta"><i class="ph ph-fork-knife"></i> ${day.food_rec}</span>` : ''}
            </div>
            ${budgetLine}
            ${interCity}
            ${returnTrip}
            <div class="day-regen-bar">
                <button class="regen-btn" data-regen-day="${idx}" onclick="window.regenerateDay(${idx})">
                    <i class="ph ph-arrows-clockwise"></i> Regenerate day
                </button>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = navHtml + cardsHtml;

    // Set up scroll-based active pill highlighting
    setupDayNavHighlighting();
}

function renderTransportPills(title, icon, options) {
    return `
        <div class="transport-pills">
            <span class="transport-pills-label"><i class="ph ${icon}"></i> ${title}</span>
            ${options.map(opt => {
                const costDisplay = opt.cost && opt.cost !== '0' ? `${currency_symbol}${opt.cost}` : '';
                const durationDisplay = opt.duration || '';
                return `
                <span class="transport-pill">
                    <span class="pill-mode">${opt.mode}</span>
                    ${durationDisplay ? `<span class="pill-detail">${durationDisplay}</span>` : ''}
                    ${costDisplay ? `<span class="pill-cost">${costDisplay}</span>` : ''}
                </span>`;
            }).join('')}
        </div>`;
}

function renderSlot(label, slot, icon, timeClass) {
    if (!slot) return '';
    const costDisplay = slot.cost && slot.cost !== '0' ? `${currency_symbol}${slot.cost}` : 'Free';
    return `
        <div class="time-slot ${timeClass}">
            <div class="slot-time"><i class="ph ${icon}"></i><span>${label}</span></div>
            <div class="slot-content">
                <span class="slot-activity">${slot.activity}</span>
                ${slot.location ? `<span class="slot-location"><i class="ph ph-map-pin"></i> ${slot.location}</span>` : ''}
                <div class="slot-meta">
                    <span><i class="ph ph-clock"></i> ${slot.duration}</span>
                    <span><i class="ph ph-wallet"></i> ${costDisplay}</span>
                </div>
                ${slot.tip ? `<span class="slot-tip"><i class="ph ph-lightbulb"></i> ${slot.tip}</span>` : ''}
            </div>
        </div>`;
}

function renderDayBudget(day, currency) {
    let activitiesCost = 0;
    let foodCost = 0;
    let hotelCost = 0;

    ['morning', 'afternoon', 'evening'].forEach(slot => {
        if (day[slot]) {
            const costStr = cleanCost(day[slot].cost);
            const num = parseFloat(costStr.split('-')[0]);
            if (!isNaN(num)) activitiesCost += num;
        }
    });

    // Estimate food cost based on budget level
    const foodEstimates = { backpacker: 20, moderate: 45, comfort: 75, luxury: 120 };
    foodCost = foodEstimates[state.budget] || 45;

    if (day.accommodation) {
        const accom = parseFloat(cleanCost(day.accommodation.price_night));
        if (!isNaN(accom)) hotelCost = accom;
    }

    const dayTotal = activitiesCost + foodCost + hotelCost;

    return `
        <div class="day-budget-line">
            <span class="budget-item"><i class="ph ph-ticket"></i> Activities: ${currency.symbol}${Math.round(activitiesCost)}</span>
            <span class="budget-separator">+</span>
            <span class="budget-item"><i class="ph ph-fork-knife"></i> Food: ~${currency.symbol}${foodCost}</span>
            <span class="budget-separator">+</span>
            <span class="budget-item"><i class="ph ph-bed"></i> Hotel: ${currency.symbol}${hotelCost}</span>
            <span class="budget-separator">=</span>
            <span class="budget-total">${currency.symbol}${Math.round(dayTotal)}/day</span>
        </div>`;
}

function setupDayNavHighlighting() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const idx = entry.target.id.replace('day-card-', '');
                document.querySelectorAll('.day-nav-pill').forEach(p => p.classList.remove('active'));
                const pill = document.querySelector(`.day-nav-pill[data-day-index="${idx}"]`);
                if (pill) {
                    pill.classList.add('active');
                    // Scroll pill into view within the nav
                    pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        });
    }, { threshold: 0.3, rootMargin: `-${parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) + 50}px 0px -50% 0px` });

    document.querySelectorAll('.day-card[id^="day-card-"]').forEach(card => observer.observe(card));
}

// ─── Trip Summary Card (at top, before day-by-day) ─────────────────────────

function renderTripSummaryCard(itinerary, currency, weather) {
    const container = document.getElementById('itinerary-days');
    const navEl = container.querySelector('.day-nav');

    let totalCost = 0;
    let totalAccom = 0;
    const citiesVisited = new Set();
    const highlights = [];

    itinerary.forEach(day => {
        citiesVisited.add(day.location);
        ['morning', 'afternoon', 'evening'].forEach(slot => {
            if (day[slot]) {
                const costStr = cleanCost(day[slot].cost);
                const num = parseFloat(costStr.split('-')[0]);
                if (!isNaN(num)) totalCost += num;
            }
        });
        if (day.accommodation) {
            const accom = parseFloat(cleanCost(day.accommodation.price_night));
            if (!isNaN(accom)) totalAccom += accom;
        }
        // Collect highlights (morning activities tend to be the main attractions)
        if (day.morning && day.morning.activity) highlights.push(day.morning.activity);
    });

    // Food estimate
    const foodEstimates = { backpacker: 20, moderate: 45, comfort: 75, luxury: 120 };
    const totalFood = (foodEstimates[state.budget] || 45) * itinerary.length;
    const grandTotal = totalCost + totalAccom + totalFood;

    // Weather summary
    let weatherSummary = '';
    if (weather && weather.length > 0) {
        const avgTemp = Math.round(weather.reduce((s, w) => s + w.tempMax, 0) / weather.length);
        weatherSummary = `~${avgTemp}° avg`;
    }

    const summaryCard = document.createElement('div');
    summaryCard.className = 'trip-summary-card';
    summaryCard.innerHTML = `
        <div class="trip-summary-title"><i class="ph ph-compass"></i> Trip Overview — ${state.destination}</div>
        <div class="trip-summary-grid">
            <div class="trip-summary-stat"><span class="stat-value">${itinerary.length}</span><span class="stat-label">Days</span></div>
            <div class="trip-summary-stat"><span class="stat-value">${citiesVisited.size}</span><span class="stat-label">Cities</span></div>
            <div class="trip-summary-stat"><span class="stat-value">${currency.symbol}${Math.round(grandTotal)}</span><span class="stat-label">Est. Total</span></div>
            ${weatherSummary ? `<div class="trip-summary-stat"><span class="stat-value">${weatherSummary}</span><span class="stat-label">Weather</span></div>` : ''}
        </div>
        ${highlights.length > 0 ? `
        <div class="trip-highlights">
            ${highlights.slice(0, 5).map(h => `<span class="trip-highlight-chip">${h}</span>`).join('')}
        </div>` : ''}
    `;

    // Insert after nav, before day cards
    const existingSummary = container.querySelector('.trip-summary-card');
    if (existingSummary) existingSummary.remove();

    if (navEl && navEl.nextSibling) {
        container.insertBefore(summaryCard, navEl.nextSibling);
    } else {
        container.prepend(summaryCard);
    }
}

// ─── Packing Suggestions ───────────────────────────────────────────────────

function renderPackingSuggestions(weather) {
    const container = document.getElementById('trip-summary');

    // Remove existing packing section
    const existing = container.querySelector('.packing-section');
    if (existing) existing.remove();

    if (!weather || weather.length === 0) return;

    // Analyze weather conditions
    const avgTemp = weather.reduce((s, w) => s + (w.tempMax + w.tempMin) / 2, 0) / weather.length;
    const hasRain = weather.some(w => w.precipitation > 2 || (w.icon && /🌧|🌦|⛈|🌨/.test(w.icon)));
    const isHot = avgTemp > 28;
    const isCold = avgTemp < 12;
    const isMild = !isHot && !isCold;
    const hasWind = weather.some(w => w.windSpeed > 30);

    const categories = [];

    // Essentials always
    categories.push({
        title: 'Essentials',
        icon: 'ph-backpack',
        items: ['Passport & copies', 'Phone charger & adapter', 'Reusable water bottle', 'Day bag / backpack', 'Travel documents']
    });

    // Weather-based clothing
    if (isHot) {
        categories.push({
            title: 'Hot Weather',
            icon: 'ph-sun',
            items: ['Sunscreen SPF 50+', 'Sunglasses', 'Wide-brim hat', 'Light breathable clothes', 'Sandals', 'Aloe vera gel']
        });
    } else if (isCold) {
        categories.push({
            title: 'Cold Weather',
            icon: 'ph-snowflake',
            items: ['Warm layers', 'Thermal base layer', 'Insulated jacket', 'Warm hat & gloves', 'Scarf', 'Warm socks']
        });
    } else if (isMild) {
        categories.push({
            title: 'Mild Weather',
            icon: 'ph-cloud-sun',
            items: ['Light layers', 'Long-sleeve shirt', 'Light jacket', 'Comfortable walking shoes', 'Sunglasses']
        });
    }

    if (hasRain) {
        categories.push({
            title: 'Rain Gear',
            icon: 'ph-cloud-rain',
            items: ['Waterproof jacket', 'Compact umbrella', 'Waterproof bag cover', 'Quick-dry clothes', 'Waterproof shoes']
        });
    }

    if (hasWind) {
        categories.push({
            title: 'Windy Conditions',
            icon: 'ph-wind',
            items: ['Windbreaker', 'Secure hat with strap', 'Lip balm', 'Hair ties']
        });
    }

    // Activity-based
    if (state.interests.includes('nature') || state.interests.includes('adventure')) {
        categories.push({
            title: 'Outdoor Activities',
            icon: 'ph-mountains',
            items: ['Hiking shoes', 'Moisture-wicking socks', 'Insect repellent', 'First aid basics', 'Headlamp']
        });
    }

    const packingHtml = `
        <div class="packing-section">
            <div class="packing-title"><i class="ph ph-suitcase-rolling"></i> Packing Suggestions</div>
            <div class="packing-grid">
                ${categories.map(cat => `
                    <div class="packing-category">
                        <div class="packing-category-title"><i class="ph ${cat.icon}"></i> ${cat.title}</div>
                        <ul class="packing-items">
                            ${cat.items.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        </div>`;

    container.insertAdjacentHTML('beforeend', packingHtml);
}

// ─── Bottom Summary (existing, kept for compatibility) ─────────────────────

function renderSummary(itinerary, currency) {
    const summary = document.getElementById('trip-summary');

    // Remove existing summary-cards if present (but keep packing)
    const existingCards = summary.querySelector('.summary-cards');
    if (existingCards) existingCards.remove();

    let totalActivities = 0, totalCost = 0, totalAccom = 0;
    const uniqueHotels = new Set();

    itinerary.forEach(day => {
        ['morning', 'afternoon', 'evening'].forEach(slot => {
            if (day[slot]) {
                totalActivities++;
                const costStr = cleanCost(day[slot].cost);
                const num = parseFloat(costStr.split('-')[0]);
                if (!isNaN(num)) totalCost += num;
            }
        });
        if (day.accommodation) {
            const accom = parseFloat(cleanCost(day.accommodation.price_night));
            if (!isNaN(accom)) totalAccom += accom;
            uniqueHotels.add(day.accommodation.name);
        }
    });

    const cardsHtml = `
        <div class="summary-cards">
            <div class="summary-card"><span class="summary-value">${itinerary.length}</span><span class="summary-label">Days</span></div>
            <div class="summary-card"><span class="summary-value">${totalActivities}</span><span class="summary-label">Activities</span></div>
            <div class="summary-card"><span class="summary-value">${uniqueHotels.size}</span><span class="summary-label">Hotels</span></div>
            <div class="summary-card"><span class="summary-value">${currency.symbol}${Math.round(totalCost)}</span><span class="summary-label">Activities</span></div>
            <div class="summary-card"><span class="summary-value">${currency.symbol}${Math.round(totalAccom)}</span><span class="summary-label">Accommodation</span></div>
            <div class="summary-card"><span class="summary-value">${currency.symbol}${Math.round(totalCost + totalAccom)}</span><span class="summary-label">Est. Total</span></div>
        </div>`;

    summary.insertAdjacentHTML('afterbegin', cardsHtml);
}
