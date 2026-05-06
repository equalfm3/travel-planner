import state from './state.js';

export async function queryOllama(prompt) {
    const res = await fetch(`${state.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: state.ollamaModel, prompt, stream: false, options: { temperature: 0.7, num_predict: 4096 } }),
    });
    if (!res.ok) throw new Error(`Ollama: ${res.status}`);
    const data = await res.json();
    return data.response;
}

export async function checkOllama() {
    try {
        const res = await fetch(`${state.ollamaUrl}/api/tags`);
        if (res.ok) { setStatus(true); return true; }
    } catch (e) {}
    setStatus(false);
    return false;
}

function setStatus(ok) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');
    if (dot) { dot.classList.toggle('error', !ok); }
    if (text) { text.textContent = ok ? 'Ollama' : 'Offline'; }
}
