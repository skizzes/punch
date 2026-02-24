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
    const els = document.querySelectorAll('.htp-card-premium, .boost-card-cyber, .tier-card-premium, .obs-item-p');
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

// ── Hero Sprite Background Removal ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const heroEl = document.querySelector('.pixel-punch-hero');
    if (!heroEl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Just in case
    img.src = 'assets/monkey_sprites.png';
    // Landing pages are at /landing, assets are at /assets
    img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);

        const p = cx.getImageData(0, 0, c.width, c.height);
        // Top-left pixel is the background color color-key
        const bgR = p.data[0], bgG = p.data[1], bgB = p.data[2];

        for (let i = 0; i < p.data.length; i += 4) {
            const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
            // Safe tolerance to remove flat background without eating into sprite body
            if (Math.abs(r - bgR) < 10 && Math.abs(g - bgG) < 10 && Math.abs(b - bgB) < 10) {
                p.data[i + 3] = 0; // Transparent
            }
        }
        cx.putImageData(p, 0, 0);

        // Swap background to data URL 
        heroEl.style.backgroundImage = `url(${c.toDataURL()})`;
    };
});

// ── Dancing Favicon ──────────────────────────────────────────────────────────
(function startFaviconDance() {
    const S = [
        { x: 28, y: 52, w: 140, h: 114 }, // 0  run 1
        { x: 199, y: 52, w: 141, h: 114 }, // 1  run 2
        { x: 369, y: 52, w: 140, h: 114 }, // 2  run 3
        { x: 545, y: 52, w: 141, h: 114 }, // 3  run 4
        { x: 740, y: 52, w: 140, h: 114 }, // 4  run 5
        { x: 28, y: 223, w: 138, h: 113 }, // 5  pose 1
        { x: 192, y: 223, w: 125, h: 113 }, // 6  pose 2
        { x: 355, y: 223, w: 125, h: 113 }, // 7  pose 3 – arms up
        { x: 523, y: 223, w: 129, h: 113 }, // 8  pose 4
        { x: 689, y: 223, w: 125, h: 113 }, // 9  pose 5
        { x: 880, y: 223, w: 120, h: 113 }, // 10 pose 6
    ];
    const DANCE_FRAMES = [5, 7, 6, 7, 8, 7, 9, 7, 10, 7];
    const FPS = 8;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.appendChild(link);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'assets/monkey_sprites.png';

    let frameIdx = 0;
    let last = 0;
    const interval = 1000 / FPS;

    img.onload = () => {
        const offscreen = document.createElement('canvas');
        offscreen.width = img.width;
        offscreen.height = img.height;
        const oc = offscreen.getContext('2d');
        oc.drawImage(img, 0, 0);
        const id = oc.getImageData(0, 0, img.width, img.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            // Safe tolerance for green background
            if (g > 130 && g > r * 1.3 && g > b * 1.3) d[i + 3] = 0;
        }
        oc.putImageData(id, 0, 0);

        const step = (ts) => {
            if (ts - last >= interval) {
                last = ts;
                const sp = S[DANCE_FRAMES[frameIdx]];
                ctx.clearRect(0, 0, 32, 32);

                // Draw sprite scaled to fit 32x32, centered
                const scale = Math.min(32 / sp.w, 32 / sp.h);
                const dw = sp.w * scale, dh = sp.h * scale;
                const dx = (32 - dw) / 2, dy = (32 - dh) / 2 + 2; // subtle +2px vertical offset
                ctx.drawImage(offscreen, sp.x, sp.y, sp.w, sp.h, dx, dy, dw, dh);

                link.href = canvas.toDataURL('image/png');
                frameIdx = (frameIdx + 1) % DANCE_FRAMES.length;
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };
})();
