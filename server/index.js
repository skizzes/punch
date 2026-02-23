// server/index.js – Optional leaderboard server (Node.js + Express)
// Run: npm install express cors && node server/index.js
// GET  /api/leaderboard  -> top 10 entries
// POST /api/score        -> submit { name, score, time, plush, streak }

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB = path.join(__dirname, 'scores.json');

app.use(cors());
app.use(express.json());

// ── In-memory store (also persists to scores.json) ───────────────────────
let scores = [];
if (fs.existsSync(DB)) {
    try { scores = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { }
}

function persist() {
    fs.writeFileSync(DB, JSON.stringify(scores, null, 2));
}

// ── Routes ────────────────────────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
    res.json(scores.slice(0, 25));
});

app.post('/api/score', (req, res) => {
    const { name = 'Anonymous', score, time, plush, streak } = req.body;
    if (typeof score !== 'number') return res.status(400).json({ error: 'score required' });

    scores.push({
        name: String(name).slice(0, 20),
        score: Math.floor(score),
        time: Math.floor(time || 0),
        plush: Math.floor(plush || 0),
        streak: Math.floor(streak || 0),
        date: new Date().toISOString(),
    });
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 500);
    persist();
    const rank = scores.findIndex(s => s.date === entry.date) + 1;
    res.json({ ok: true, rank });
});

app.listen(PORT, () => console.log(`Punch Run leaderboard server on :${PORT}`));
