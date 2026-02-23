// src/shareCard.js – Generate a shareable score card image and show a share modal

/**
 * Renders an 800×300 share card onto an offscreen canvas using the game's
 * current biome colors, score data, and branding, then shows a modal with
 * Download + Tweet buttons.
 *
 * @param {object} engine  GameEngine instance
 * @param {object} data    { score, survivalTime, plushCount, bestStreak, biomeName }
 */
export function showShareCard(engine, data) {
    const card = _renderCard(engine, data);
    _showModal(card, data);
}

// ── Render ────────────────────────────────────────────────────────────────────
function _renderCard(engine, { score, survivalTime, plushCount, bestStreak, biomeName }) {
    const W = 800, H = 300;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // ── Background: biome sky gradient ───────────────────────────────────────
    const b = engine._getBiome();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, b.skyTop);
    grad.addColorStop(1, b.skyBot || b.skyTop);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // ── Ground strip ─────────────────────────────────────────────────────────
    ctx.fillStyle = b.groundTop || '#6dc040';
    ctx.fillRect(0, H - 50, W, 6);
    ctx.fillStyle = b.groundMid || '#5aab32';
    ctx.fillRect(0, H - 44, W, 44);

    // ── Left panel: branding ─────────────────────────────────────────────────
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(20, 20, 220, H - 40);

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
    ctx.font = 'bold 13px monospace';
    ctx.fillText('PUNCH IN THE', 36, 55);
    ctx.font = 'bold 22px monospace';
    ctx.fillText('TRENCHES', 36, 80);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffcc44';
    ctx.fillText('$PUNCH  •  SOL', 36, 100);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px monospace';
    ctx.fillText(biomeName || '', 36, 120);
    ctx.shadowBlur = 0;

    // ── Center panel: score ───────────────────────────────────────────────────
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(260, 20, 280, H - 40);

    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('SCORE', W / 2, 55);
    ctx.font = `bold ${score >= 10000 ? 52 : 62}px monospace`;
    ctx.fillStyle = '#ffcc44';
    ctx.fillText(String(Math.floor(score)).padStart(5, '0'), W / 2, 120);
    ctx.shadowBlur = 0;

    // Stats row
    const stats = [
        { label: 'TIME', value: `${Math.floor(survivalTime)}s` },
        { label: 'COINS', value: String(plushCount || 0) },
        { label: 'STREAK', value: `x${bestStreak || 0}` },
    ];
    ctx.font = 'bold 11px monospace';
    stats.forEach((s, i) => {
        const sx = 280 + 47 + i * 93;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(s.label, sx, 158);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(s.value, sx, 176);
        ctx.font = 'bold 11px monospace';
    });

    // ── Right panel: CTA ──────────────────────────────────────────────────────
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(560, 20, 220, H - 40);

    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('CAN YOU BEAT', 670, 70);
    ctx.fillText('MY SCORE?', 670, 90);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffcc44';
    ctx.fillText('play.punchonsol.com', 670, 125);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px monospace';
    ctx.fillText('#PUNCH #Solana #crypto', 670, 148);
    ctx.shadowBlur = 0;

    // Pump.fun pill badge
    ctx.fillStyle = '#00c853';
    _roundRect(ctx, 610, 180, 120, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('pump.fun/$PUNCH', 670, 198);

    return cv;
}

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function _showModal(cardCanvas, { score }) {
    // Remove existing modal if any
    document.getElementById('share-modal')?.remove();

    const dataURL = cardCanvas.toDataURL('image/png');

    const overlay = document.createElement('div');
    overlay.id = 'share-modal';
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.82);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        z-index:10000;font-family:monospace;
    `;

    const img = document.createElement('img');
    img.src = dataURL;
    img.style.cssText = 'max-width:90vw;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.7);';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;margin-top:16px;';

    const tweetText = encodeURIComponent(
        `🐂 I scored ${Math.floor(score)} pts in PUNCH IN THE TRENCHES!\nCan you beat me?\n\n$PUNCH #Solana #crypto\n▶️ play.punchonsol.com`
    );

    const btnStyle = (bg) => `
        padding:10px 24px;border:none;border-radius:6px;cursor:pointer;
        font:bold 13px monospace;background:${bg};color:#fff;
        transition:opacity .15s;
    `;

    const tweetBtn = document.createElement('button');
    tweetBtn.textContent = '🐦 SHARE ON X';
    tweetBtn.style.cssText = btnStyle('#1d9bf0');
    tweetBtn.onclick = () => window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');

    const dlBtn = document.createElement('button');
    dlBtn.textContent = '⬇️ DOWNLOAD';
    dlBtn.style.cssText = btnStyle('#22c55e');
    dlBtn.onclick = () => {
        const a = document.createElement('a');
        a.download = `punch-score-${Math.floor(score)}.png`;
        a.href = dataURL;
        a.click();
    };

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ CLOSE';
    closeBtn.style.cssText = btnStyle('#555');
    closeBtn.onclick = () => overlay.remove();

    btnRow.append(tweetBtn, dlBtn, closeBtn);
    overlay.append(img, btnRow);
    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
