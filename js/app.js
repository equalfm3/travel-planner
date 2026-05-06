import state from './core/state.js';
import { checkOllama } from './core/ollama.js';
import { showSection, toast, loadTrips } from './core/utils.js';
import { generateTrip } from './features/planner.js';
import { saveCurrentTrip, showSavedTrips, copyTrip, printTrip } from './features/saved.js';

document.addEventListener('DOMContentLoaded', () => {
    // Particles
    initParticles(document.getElementById('particle-canvas'));

    // Typewriter
    const typedEl = document.getElementById('typed-text');
    if (typedEl) typewriter(typedEl, [
        'plan --dest "Tokyo" --days 7 --budget moderate',
        'explore --interests "food, culture, photography"',
        'plan --dest "Iceland" --days 5 --solo --adventure',
        'itinerary --dest "Amalfi Coast" --couple --luxury',
        'plan --dest "Marrakech" --days 3 --backpacker',
    ]);

    // Hero CTA
    document.getElementById('start-btn')?.addEventListener('click', () => {
        document.getElementById('input-section').scrollIntoView({ behavior: 'smooth' });
    });

    // Chips (single select)
    ['days-chips', 'budget-chips', 'travelers-chips', 'radius-chips'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip');
            if (!chip) return;
            e.currentTarget.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const key = id.replace('-chips', '');
            state[key] = chip.dataset.value;
        });
    });

    // Interests (multi select)
    document.getElementById('interests-chips')?.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        chip.classList.toggle('active');
        const val = chip.dataset.value;
        if (state.interests.includes(val)) state.interests = state.interests.filter(v => v !== val);
        else state.interests.push(val);
    });

    // Generate
    document.getElementById('generate-btn')?.addEventListener('click', () => {
        document.getElementById('generate-btn').disabled = true;
        generateTrip().finally(() => { document.getElementById('generate-btn').disabled = false; });
    });

    // Actions
    document.getElementById('btn-save')?.addEventListener('click', saveCurrentTrip);
    document.getElementById('btn-copy')?.addEventListener('click', copyTrip);
    document.getElementById('btn-print')?.addEventListener('click', printTrip);
    document.getElementById('nav-saved')?.addEventListener('click', showSavedTrips);
    document.getElementById('saved-back')?.addEventListener('click', () => showSection('input-section'));

    // Settings
    const overlay = document.getElementById('settings-overlay');
    document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === ',') { e.preventDefault(); overlay.classList.add('active'); } });
    document.getElementById('settings-close')?.addEventListener('click', () => overlay.classList.remove('active'));
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
    document.getElementById('ollama-url').value = state.ollamaUrl;
    document.getElementById('ollama-model').value = state.ollamaModel;
    document.getElementById('save-settings')?.addEventListener('click', () => {
        state.ollamaUrl = document.getElementById('ollama-url').value.replace(/\/$/, '');
        state.ollamaModel = document.getElementById('ollama-model').value;
        localStorage.setItem('ollama-url', state.ollamaUrl);
        localStorage.setItem('ollama-model', state.ollamaModel);
        overlay.classList.remove('active');
        checkOllama();
    });

    checkOllama();
    loadTrips();
});

// ─── Inline UI utils ───
function initParticles(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize(); window.addEventListener('resize', resize);
    for (let i = 0; i < 30; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, r: Math.random() * 1.5 + 0.5 });
    (function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > canvas.width) p.vx *= -1; if (p.y < 0 || p.y > canvas.height) p.vy *= -1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'; ctx.fill(); });
        for (let i = 0; i < particles.length; i++) for (let j = i + 1; j < particles.length; j++) { const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y, d = Math.sqrt(dx*dx+dy*dy); if (d < 130) { ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y); ctx.strokeStyle = `rgba(56,189,248,${0.02*(1-d/130)})`; ctx.stroke(); } }
        requestAnimationFrame(draw);
    })();
}

function typewriter(el, phrases, { speed = 45, pause = 2500 } = {}) {
    let pi = 0, ci = 0, del = false;
    (function tick() {
        const p = phrases[pi];
        if (!del) { el.textContent = p.slice(0, ++ci); if (ci === p.length) { setTimeout(() => { del = true; tick(); }, pause); return; } }
        else { el.textContent = p.slice(0, --ci); if (ci === 0) { del = false; pi = (pi + 1) % phrases.length; } }
        setTimeout(tick, del ? speed / 2 : speed);
    })();
}
