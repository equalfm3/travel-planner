const state = {
    destination: '',
    origin: '',
    days: '5',
    budget: 'moderate',
    travelers: 'solo',
    interests: [],
    notes: '',
    radius: 'city-only',
    ollamaUrl: localStorage.getItem('ollama-url') || 'http://localhost:11434',
    ollamaModel: localStorage.getItem('ollama-model') || 'gemma3:12b',
    currentTrip: null,
    savedTrips: JSON.parse(localStorage.getItem('wandr-trips') || '[]'),
    destinationInfo: null,
};

export default state;
