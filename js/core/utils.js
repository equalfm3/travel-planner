import state from './state.js';

export function toast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), duration);
}

export function hideAllSections() {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('visible'));
}

export function showSection(id) {
    hideAllSections();
    document.getElementById(id)?.classList.add('visible');
}

export function saveTrips() {
    localStorage.setItem('wandr-trips', JSON.stringify(state.savedTrips.slice(0, 20)));
}

export function parseJSON(text, type = 'array') {
    if (!text) return null;
    try {
        const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
        const m = text.match(pattern);
        if (m) {
            // Clean common LLM issues: comments, trailing commas
            let cleaned = m[0];
            cleaned = cleaned.replace(/\/\/[^\n]*/g, '');       // remove // comments
            cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, ''); // remove /* */ comments
            cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');    // remove trailing commas
            return JSON.parse(cleaned);
        }
    } catch (e) { console.warn('JSON parse:', e); }
    return null;
}
