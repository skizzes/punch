// src/storage.js – localStorage leaderboard + opt-in global server submission
const LB_KEY = 'punchrun_lb';
const BEST_KEY = 'punchrun_best';
const MAX_ENTRIES = 25;

// Server URL — same origin on port 3001 in dev; override via window.PUNCH_SERVER
function serverBase() {
  return (typeof window !== 'undefined' && window.PUNCH_SERVER) ||
    `${location.protocol}//${location.hostname}:3001`;
}

export class StorageManager {
  saveScore({ score, time, plush, streak, name = 'Anonymous' }) {
    const entry = {
      name: name.trim().slice(0, 16) || 'Anonymous',
      score: Math.floor(score),
      time: Math.floor(time),
      plush,
      streak,
      date: new Date().toISOString(),
    };
    const board = this.getLeaderboard();
    board.push(entry);
    board.sort((a, b) => b.score - a.score);
    localStorage.setItem(LB_KEY, JSON.stringify(board.slice(0, MAX_ENTRIES)));
    if (entry.score > this.getBestScore())
      localStorage.setItem(BEST_KEY, entry.score);
    return entry;
  }

  getBestScore() {
    return parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  }

  getLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); }
    catch { return []; }
  }

  clearLeaderboard() {
    localStorage.removeItem(LB_KEY);
    localStorage.removeItem(BEST_KEY);
  }

  // ── Global server integration ────────────────────────────────────────────

  /** Submit score to global server. Returns {ok, rank} or null on failure. */
  async submitToGlobal({ name, score, time, plush, streak }) {
    try {
      const res = await fetch(`${serverBase()}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score, time, plush, streak }),
      });
      if (!res.ok) return null;
      return await res.json();   // { ok: true, rank: N }
    } catch { return null; }
  }

  /** Fetch top-25 global leaderboard. Returns array or null if server unreachable. */
  async fetchGlobalLeaderboard() {
    try {
      const res = await fetch(`${serverBase()}/api/leaderboard`);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }  // null = server offline
  }
}
