/**
 * Minimal local server for Wandr
 * - Serves static files
 * - Persists saved trips to trips.json in the project folder
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TRIPS_FILE = path.join(__dirname, 'trips.json');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
}

function readTrips() {
    try {
        if (fs.existsSync(TRIPS_FILE)) {
            return JSON.parse(fs.readFileSync(TRIPS_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Error reading trips.json:', e.message);
    }
    return [];
}

function writeTrips(trips) {
    fs.writeFileSync(TRIPS_FILE, JSON.stringify(trips, null, 2), 'utf-8');
}

const server = http.createServer((req, res) => {
    // API: GET /api/trips
    if (req.method === 'GET' && req.url === '/api/trips') {
        const trips = readTrips();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(trips));
        return;
    }

    // API: POST /api/trips (save all trips)
    if (req.method === 'POST' && req.url === '/api/trips') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const trips = JSON.parse(body);
                writeTrips(trips);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // API: DELETE /api/trips (clear all)
    if (req.method === 'DELETE' && req.url === '/api/trips') {
        writeTrips([]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // Static files
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`Wandr server running at http://localhost:${PORT}`);
});
