// server/index.js – Punch leaderboard server (Supabase persistence)
// ─────────────────────────────────────────────────────────────────
// ENV VARS required:
//   SUPABASE_URL  = https://xxxx.supabase.co
//   SUPABASE_KEY  = your anon/service_role key
// Optional:
//   PORT          = 3001 (default)
// ─────────────────────────────────────────────────────────────────
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Supabase client (lightweight REST calls via fetch) ────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function sbHeaders() {
    return {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation',
    };
}

async function getTopScores(limit = 25) {
    if (!SUPABASE_URL) return [];
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scores?order=score.desc&limit=${limit}`,
        { headers: sbHeaders() }
    );
    return res.ok ? await res.json() : [];
}

async function insertScore(entry) {
    if (!SUPABASE_URL) return null;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify(entry),
    });
    return res.ok ? (await res.json())[0] : null;
}

async function getRank(id) {
    if (!SUPABASE_URL) return null;
    // Count how many scores are strictly higher
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scores?select=count&score=gt.0`,
        { headers: { ...sbHeaders(), 'Prefer': 'count=exact', 'Range': '0-0' } }
    );
    // Simpler: fetch top 500 and find position
    const all = await getTopScores(500);
    const idx = all.findIndex(s => s.id === id);
    return idx >= 0 ? idx + 1 : null;
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
    try {
        const scores = await getTopScores(25);
        res.json(scores);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/score', async (req, res) => {
    try {
        const { name, score, time, plush, streak } = req.body;
        if (!name || score == null) return res.status(400).json({ error: 'name and score required' });

        const entry = {
            name: String(name).trim().slice(0, 16) || 'Anonymous',
            score: Math.floor(Number(score)),
            time: Math.floor(Number(time) || 0),
            plush: Math.floor(Number(plush) || 0),
            streak: Math.floor(Number(streak) || 0),
        };

        const inserted = await insertScore(entry);
        const rank = inserted ? await getRank(inserted.id) : null;
        res.json({ ok: true, rank });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/health', (_, res) => res.json({ ok: true, db: !!SUPABASE_URL }));

app.listen(PORT, () => console.log(`Punch Run leaderboard server on :${PORT}`));
