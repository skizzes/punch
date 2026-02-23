// landing.js – Punch in the Trenches landing page logic

const SERVER = 'https://punch-leaderboard.onrender.com';
const MEDALS = ['🥇', '🥈', '🥉'];

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard() {
    const tbody = document.getElementById('lbBody');
    const upd = document.getElementById('lbUpdated');
    try {
        const res = await fetch(`${SERVER}/api/leaderboard`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="lb-loading">No scores yet — be the first!</td></tr>';
            return;
        }
        tbody.innerHTML = data.slice(0, 25).map((e, i) => {
            const rank = i < 3 ? MEDALS[i] : `#${i + 1}`;
            const score = `$${Number(e.score).toLocaleString()}`;
            const time = `${e.time || 0}s`;
            const coins = e.plush || 0;
            const str = e.streak || 0;
            const name = (e.name || 'Anonymous').slice(0, 16);
            return `<tr>
                <td style="font-weight:bold">${rank}</td>
                <td>${name}</td>
                <td style="color:#ffd700;font-weight:bold">${score}</td>
                <td>${time}</td>
                <td style="color:#F7931A">${coins}</td>
                <td style="color:#ef4444">${str}</td>
            </tr>`;
        }).join('');
        // Update stat counter
        const statEl = document.getElementById('statPlayers');
        if (statEl) statEl.textContent = data.length;
        upd.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch {
        tbody.innerHTML = '<tr><td colspan="6" class="lb-loading" style="color:#ef4444">⚠️ Server offline — play game to see rankings</td></tr>';
    }
}

document.getElementById('refreshBtn')?.addEventListener('click', loadLeaderboard);
loadLeaderboard();

// ── Wallet Connect ────────────────────────────────────────────────────────────
let walletPubkey = null;

function getProvider() {
    return window.phantom?.solana ?? window.solana ?? window.solflare ?? null;
}

async function connectWallet() {
    const provider = getProvider();
    if (!provider) {
        alert('No Solana wallet found! Install Phantom or Solflare.');
        return;
    }
    try {
        const resp = await provider.connect();
        walletPubkey = resp.publicKey.toString();
        const short = `${walletPubkey.slice(0, 4)}...${walletPubkey.slice(-4)}`;
        ['walletBtn', 'walletBtnLg'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = `🔗 ${short}`;
                el.style.borderColor = '#22c55e';
                el.style.color = '#22c55e';
            }
        });
        const statusEl = document.getElementById('walletStatus');
        if (statusEl) statusEl.textContent = `✅ Connected: ${short}  — perks activate in-game`;
    } catch (e) {
        console.warn('Wallet connect rejected', e);
    }
}

document.getElementById('walletBtn')?.addEventListener('click', connectWallet);
document.getElementById('walletBtnLg')?.addEventListener('click', connectWallet);

// ── Particle System ───────────────────────────────────────────────────────────
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    const symbols = ['₿', '◆', 'Ⓢ', '⚔️', '🔥', '$', '💊'];
    for (let i = 0; i < 22; i++) {
        const p = document.createElement('div');
        const size = 12 + Math.random() * 16;
        const left = Math.random() * 100;
        const delay = Math.random() * 12;
        const dur = 10 + Math.random() * 14;
        const sym = symbols[Math.floor(Math.random() * symbols.length)];
        p.textContent = sym;
        p.style.cssText = `
            position:absolute;left:${left}%;bottom:-40px;
            font-size:${size}px;opacity:0;
            animation:floatParticle ${dur}s ${delay}s linear infinite;
            pointer-events:none;user-select:none;`;
        container.appendChild(p);
    }
}

// Inject particle keyframe
const style = document.createElement('style');
style.textContent = `
@keyframes floatParticle {
  0%   { transform:translateY(0) rotate(0deg);  opacity:0; }
  10%  { opacity:0.25; }
  90%  { opacity:0.08; }
  100% { transform:translateY(-100vh) rotate(360deg); opacity:0; }
}`;
document.head.appendChild(style);
createParticles();

// ── Scroll animations ─────────────────────────────────────────────────────────
function initScrollAnim() {
    const els = document.querySelectorAll('.htp-card,.boost-card,.tier-card,.obs-item,.biome,.coin-ref');
    els.forEach(el => el.classList.add('fade-in'));
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    els.forEach(el => obs.observe(el));
}
initScrollAnim();

// ── Animated Game Preview Biomes ──────────────────────────────────────────────
const BIOME_SKIES = [
    'linear-gradient(180deg,#87CEEB 0%,#c8e8f8 100%)',
    'linear-gradient(180deg,#040820 0%,#0a1030 100%)',
    'linear-gradient(180deg,#000800 0%,#001500 100%)',
    'linear-gradient(180deg,#e8a844 0%,#f0c878 100%)',
    'linear-gradient(180deg,#b0c4de 0%,#e8eef5 100%)',
    'linear-gradient(180deg,#2a0a0a 0%,#5a1a0a 100%)',
];
let biomeIdx = 0;
const previewSky = document.getElementById('previewSky');
if (previewSky) {
    setInterval(() => {
        biomeIdx = (biomeIdx + 1) % BIOME_SKIES.length;
        previewSky.style.background = BIOME_SKIES[biomeIdx];
    }, 4000);
}

// ── Smooth nav active state ───────────────────────────────────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => { if (window.scrollY >= s.offsetTop - 80) current = s.id; });
    navLinks.forEach(a => {
        a.style.color = a.getAttribute('href') === `#${current}` ? '#22c55e' : '';
    });
}, { passive: true });
