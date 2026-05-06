/**
 * External APIs — only for live/dynamic data
 * Currency, transport costs, hotels = handled by AI (static knowledge)
 * Weather, coordinates = need real-time data
 */

// Geocoding via Nominatim (OpenStreetMap) — needed for weather coordinates
export async function geocode(place) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`, {
            headers: { 'User-Agent': 'Wandr-TravelPlanner/1.0' }
        });
        const data = await res.json();
        if (data.length === 0) return null;
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
    } catch (e) {
        console.warn('Geocoding failed:', e);
        return null;
    }
}

// Weather forecast via Open-Meteo (free, no key) — changes daily, needs API
export async function getWeather(lat, lon, days = 7) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto&forecast_days=${Math.min(days, 16)}`);
        const data = await res.json();
        if (!data.daily) return null;

        return data.daily.time.map((date, i) => ({
            date,
            tempMax: data.daily.temperature_2m_max[i],
            tempMin: data.daily.temperature_2m_min[i],
            rain: data.daily.precipitation_sum[i],
            code: data.daily.weathercode[i],
            icon: weatherIcon(data.daily.weathercode[i]),
        }));
    } catch (e) {
        console.warn('Weather failed:', e);
        return null;
    }
}

function weatherIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '🌨️';
    if (code <= 82) return '🌧️';
    if (code <= 86) return '❄️';
    return '⛈️';
}
