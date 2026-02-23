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
    img.src = '../assets/monkey_sprites.png';
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

// ── Obstacles Showcase Canvas ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const c = document.getElementById('obs-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');

    // Draw Biome 0 (Grasslands)
    const grad = ctx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, '#87CEEB');
    grad.addColorStop(1, '#c8e8f8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 200);

    // Draw Ground
    const groundY = 200;
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(0, groundY, 800, 40);

    // Draw some simple grass texturing to make it "real scenario"
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 10; i < 800; i += 25) {
        ctx.fillRect(i, groundY + 4, 6, 2);
    }

    let currX = 40; // padding
    const gap = 60;

    function drawCandle(type, w, h) {
        const ox = currX;
        const oy = groundY - h;
        if (type === 'greencandle' || type === 'tallcandle') {
            const wickX = ox + ~~(w / 2) - 1;
            ctx.fillStyle = '#1a6b1a'; ctx.fillRect(wickX, oy, 3, 12);
            ctx.fillStyle = '#22c55e'; ctx.fillRect(ox, oy + 12, w, h - 12);
            ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(ox + 2, oy + 14, 5, h - 18);
            ctx.strokeStyle = '#15803d'; ctx.lineWidth = 1; ctx.strokeRect(ox, oy + 12, w, h - 12);
        } else if (type === 'redcandle') {
            const wickX = ox + ~~(w / 2) - 1;
            ctx.fillStyle = '#991b1b'; ctx.fillRect(wickX, oy + h - 10, 3, 10);
            ctx.fillStyle = '#ef4444'; ctx.fillRect(ox, oy, w, h - 10);
            ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(ox, oy, w, 6);
            ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, w, h - 10);
        }

        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(type.toUpperCase(), ox + w / 2 + 1, groundY + 12);
        ctx.fillStyle = '#fff';
        ctx.fillText(type.toUpperCase(), ox + w / 2, groundY + 11);

        currX += w + gap;
    }

    drawCandle('greencandle', 18, 70);
    drawCandle('redcandle', 18, 55);
    drawCandle('tallcandle', 18, 100);

    // Duck Bar (w: 75, h: 18, floatAbove: 28)
    let w = 75, h = 18;
    let ox = currX;
    let oy = groundY - 28 - h;
    ctx.fillStyle = '#ffaa00'; ctx.fillRect(ox + 6, oy + 2, w - 12, h - 4);
    ctx.fillStyle = '#000';
    for (let s = 0; s < w - 12; s += 14) ctx.fillRect(ox + 6 + s, oy + 2, 6, h - 4);
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffcc44'; ctx.fillRect(ox + 6, oy + 2, w - 12, h - 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#cc7700'; ctx.fillRect(ox, oy + ~~(h / 2) - 1, 8, 3);
    ctx.fillRect(ox + w - 8, oy + ~~(h / 2) - 1, 8, 3);
    ctx.strokeStyle = '#cc7700'; ctx.lineWidth = 1.5; ctx.strokeRect(ox + 6, oy + 2, w - 12, h - 4);
    ctx.fillStyle = '#3a2200'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DUCK', ox + w / 2, oy + h / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = 'bold 12px monospace'; ctx.textBaseline = 'top';
    ctx.fillText('DUCK BAR', ox + w / 2 + 1, groundY + 12);
    ctx.fillStyle = '#fff';
    ctx.fillText('DUCK BAR', ox + w / 2, groundY + 11);
    currX += w + gap;

    // Crash Bar (w: 100, h: 14, floatAbove: 26)
    w = 100; h = 14;
    ox = currX;
    oy = groundY - 26 - h;
    ctx.fillStyle = '#dc2626'; ctx.fillRect(ox, oy + 2, w, h - 4);
    ctx.fillStyle = '#1a1a1a';
    for (let s = 0; s < w; s += 18) ctx.fillRect(ox + s, oy + 2, 8, h - 4);
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#ef4444'; ctx.fillRect(ox, oy + 2, w, h - 4);
    ctx.globalAlpha = 1; ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, w, h);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CRASH', ox + w / 2, oy + h / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = 'bold 12px monospace'; ctx.textBaseline = 'top';
    ctx.fillText('CRASH BAR', ox + w / 2 + 1, groundY + 12);
    ctx.fillStyle = '#fff';
    ctx.fillText('CRASH BAR', ox + w / 2, groundY + 11);
    currX += w + gap - 10;

    // Spike Cluster (w: 54, h: 30, ground: true)
    w = 54; h = 30;
    ox = currX;
    oy = groundY - h;
    ctx.fillStyle = '#64748b';
    for (let s = 0; s < 3; s++) {
        const sx = ox + s * 18;
        const sh = 16 + (s % 2) * 8; // alternate heights
        ctx.beginPath(); ctx.moveTo(sx, oy + h); ctx.lineTo(sx + 9, oy + h - sh); ctx.lineTo(sx + 18, oy + h);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.stroke();
        // glint
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath();
        ctx.moveTo(sx + 5, oy + h - 4); ctx.lineTo(sx + 9, oy + h - sh); ctx.lineTo(sx + 10, oy + h - sh + 5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#64748b';
    }

    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('SPIKE CLUSTER', ox + w / 2 + 1, groundY + 12);
    ctx.fillStyle = '#fff';
    ctx.fillText('SPIKE CLUSTER', ox + w / 2, groundY + 11);
});
