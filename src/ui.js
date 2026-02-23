// src/ui.js – HUD, overlays, menus, popups, leaderboard, mobile buttons

const MILESTONE_MSGS = {
    5: { text: 'HOLDING THE LINE! ⚔️', color: '#556b2f' },
    10: { text: 'TRENCH WARRIOR! 🔥', color: '#8b4513' },
    15: { text: 'DEGEN SOLDIER! 💀', color: '#2d4a1e' },
    20: { text: 'BATTLE HARDENED! 🏆', color: '#1a1a1a' },
};

const MEDALS = ['#FFD700', '#C0C0C0', '#CD7F32'];

// ── Sprite sheet source rects (same as player.js) ──────────────────────────
const S = [
    { x: 28, y: 52, w: 140, h: 114 }, // 0  run 1
    { x: 199, y: 52, w: 141, h: 114 }, // 1  run 2
    { x: 369, y: 52, w: 140, h: 114 }, // 2  run 3
    { x: 545, y: 52, w: 141, h: 114 }, // 3  run 4
    { x: 740, y: 52, w: 140, h: 114 }, // 4  run 5
    { x: 28, y: 223, w: 138, h: 113 }, // 5  pose 1
    { x: 192, y: 223, w: 125, h: 113 }, // 6  pose 2
    { x: 355, y: 223, w: 125, h: 113 }, // 7  pose 3 (arms up)
    { x: 523, y: 223, w: 129, h: 113 }, // 8  pose 4
    { x: 689, y: 223, w: 125, h: 113 }, // 9  pose 5
    { x: 880, y: 223, w: 120, h: 113 }, // 10 pose 6 (small arms)
];

const DANCE_FRAMES = [5, 7, 6, 7, 8, 7, 9, 7, 10, 7];
const DANCE_SPEED = 0.13;

// Detect touch device once
const IS_TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

let _uiSheet = null;
(function loadUISheet() {
    const raw = new Image();
    raw.onload = () => {
        const c = document.createElement('canvas');
        c.width = raw.width; c.height = raw.height;
        const cx = c.getContext('2d');
        cx.drawImage(raw, 0, 0);
        const imgData = cx.getImageData(0, 0, c.width, c.height);
        const d = imgData.data;
        const bgR = d[0], bgG = d[1], bgB = d[2], THR = 35;
        for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i] - bgR) < THR && Math.abs(d[i + 1] - bgG) < THR && Math.abs(d[i + 2] - bgB) < THR)
                d[i + 3] = 0;
        }
        cx.putImageData(imgData, 0, 0);
        _uiSheet = c;
    };
    raw.src = 'assets/monkey_sprites.png';
})();

export class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.embedMode = engine.embedMode;
        this.popups = [];
        this.floats = [];
        this._showLB = false;
        this._danceIdx = 0;
        this._danceT = 0;
        this._lbTab = 'local';
        this._globalEntries = null;
        this._globalLoading = false;
    }

    showPopup(text, color = '#fff') {
        this.popups.push({ text, color, timer: 1.8, max: 1.8, x: this.engine.W / 2, y: this.engine.H / 2 - 50 });
    }

    showFloat(text, x, y, color = '#fbbf24') {
        if (this.floats.length > 2) this.floats.shift();
        this.floats.push({ text, color, x, y, timer: 1.2, max: 1.2 });
    }

    checkStreakMilestone(streak) {
        const msg = MILESTONE_MSGS[streak];
        if (msg) this.showPopup(msg.text, msg.color);
    }

    update(dt) {
        for (let i = this.popups.length - 1; i >= 0; i--) {
            this.popups[i].timer -= dt;
            if (this.popups[i].timer <= 0) this.popups.splice(i, 1);
        }
        for (let i = this.floats.length - 1; i >= 0; i--) {
            this.floats[i].timer -= dt;
            this.floats[i].y -= 45 * dt;
            if (this.floats[i].timer <= 0) this.floats.splice(i, 1);
        }
    }

    // ─── HUD ─────────────────────────────────────────────────────────────────
    drawHUD(ctx) {
        const e = this.engine;
        const W = e.W;

        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fillRect(0, 0, W, 34);
        ctx.fillStyle = 'rgba(61,112,34,0.5)'; ctx.fillRect(0, 33, W, 2);

        ctx.fillStyle = '#2d6a1f'; ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const hi = String(e.storage.getBestScore()).padStart(5, '0');
        const sc = String(Math.floor(e.score)).padStart(5, '0');
        ctx.fillText(`HI ${hi}  ${sc}`, W - 8, 16);

        if (e.market) {
            const mStr = e.market.getDisplayString();
            if (mStr) {
                ctx.font = 'bold 9px monospace';
                ctx.fillStyle = e.market.getColor();
                ctx.textAlign = 'right';
                ctx.fillText(mStr, W - 8, 28);
            }
        }

        ctx.textAlign = 'left'; ctx.font = '11px monospace';
        ctx.fillStyle = '#555'; ctx.fillText(`${Math.floor(e.survivalTime)}s`, 8, 10);
        ctx.fillStyle = '#F7931A'; ctx.fillText(`💰${e.plushCount}`, 8, 24);
        ctx.fillStyle = e.streak > 0 ? '#e05c00' : '#888';
        ctx.fillText(`🔥${e.streak}`, 52, 24);

        if (e.streak >= 15) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#556b2f'; ctx.font = 'bold 11px monospace';
            ctx.fillText('⚔️ TRENCH MODE ⚔️', W / 2, 9);
        }

        if (e.comboBoostActive) {
            const cW = 110, cX = W / 2 - cW / 2;
            ctx.fillStyle = 'rgba(85,107,47,0.18)'; ctx.fillRect(cX, 0, cW, 34);
            ctx.fillStyle = '#556b2f'; ctx.fillRect(cX, 30, cW * (e.comboBoostTimer / 3), 4);
            ctx.fillStyle = '#3b4a1f'; ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`COMBOx2 ${e.comboBoostTimer.toFixed(1)}`, W / 2, 24);
        }

        if (e.isWeekend) {
            ctx.fillStyle = 'rgba(247,147,26,0.15)'; ctx.fillRect(0, e.H - 18, W, 18);
            ctx.fillStyle = '#b07000'; ctx.font = '9px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🎉 WEEKEND: DOUBLE COINS 🎉', W / 2, e.H - 9);
        }

        ctx.textAlign = 'left'; ctx.font = '11px monospace'; ctx.textBaseline = 'alphabetic';
        e.powerups.getHUDData().forEach((pu, i) => {
            const by = e.H - 10 - i * 16;
            ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(6, by - 13, 72, 15);
            ctx.fillStyle = '#2d4a1e';
            ctx.fillText(`${pu.icon}${pu.label}`, 8, by);
        });

        // Mobile touch buttons (JUMP / DUCK)
        if (IS_TOUCH) {
            this._drawMobileButtons(ctx, e.W, e.H);
        }
    }

    /** On-screen jump + duck buttons for mobile */
    _drawMobileButtons(ctx, W, H) {
        const btnY = H - 60;
        const btnH = 48, btnW = 80;

        ctx.save();
        ctx.globalAlpha = 0.30;

        // JUMP – right side
        ctx.fillStyle = '#22c55e';
        ctx.beginPath(); ctx.roundRect(W - btnW - 10, btnY, btnW, btnH, 10); ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('JUMP ↑', W - btnW / 2 - 10, btnY + btnH / 2);

        // DUCK – left side
        ctx.globalAlpha = 0.30;
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.roundRect(10, btnY, btnW, btnH, 10); ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#fff';
        ctx.fillText('DUCK ↓', 10 + btnW / 2, btnY + btnH / 2);

        ctx.restore();
    }

    // ─── Popups ──────────────────────────────────────────────────────────────
    drawPopups(ctx) {
        for (const p of this.popups) {
            const alpha = Math.min(1, (p.timer / p.max) * 2);
            ctx.save(); ctx.globalAlpha = alpha;
            ctx.font = 'bold 22px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
            ctx.restore();
        }
        for (const f of this.floats) {
            const alpha = f.timer / f.max;
            ctx.save(); ctx.globalAlpha = alpha;
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
            ctx.restore();
        }
    }

    // ─── MENU ─────────────────────────────────────────────────────────────────
    drawMenu(ctx, t) {
        const e = this.engine;
        const W = e.W, H = e.H;
        const G = '#535353';

        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        ctx.fillStyle = G; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'right';
        ctx.fillText(`HI ${String(e.storage.getBestScore()).padStart(5, '0')}  00000`, W - 8, 18);
        ctx.textAlign = 'center';

        ctx.font = 'bold 28px monospace'; ctx.fillText('PUNCH IN THE', W / 2, H / 2 - 56);
        ctx.font = 'bold 32px monospace'; ctx.fillText('TRENCHES', W / 2, H / 2 - 26);

        // Animated dancers
        const danceIdx = DANCE_FRAMES[Math.floor(t / DANCE_SPEED) % DANCE_FRAMES.length];
        const sp = S[danceIdx];
        const dW = 62, dH = 56;
        if (_uiSheet) {
            const lx = W / 2 - 175 - dW / 2;
            const ly = H / 2 - 56;
            ctx.drawImage(_uiSheet, sp.x, sp.y, sp.w, sp.h, lx, ly, dW, dH);
            const rx = W / 2 + 175 - dW / 2;
            ctx.save();
            ctx.translate(rx + dW, ly); ctx.scale(-1, 1);
            ctx.drawImage(_uiSheet, sp.x, sp.y, sp.w, sp.h, 0, 0, dW, dH);
            ctx.restore();
        }

        ctx.fillStyle = '#888'; ctx.font = '11px monospace';
        ctx.fillText('Survive the crypto trenches', W / 2, H / 2 + 2);
        if (Math.floor(t * 2) % 2 === 0) {
            ctx.fillStyle = G; ctx.font = 'bold 14px monospace';
            ctx.fillText('PRESS SPACE / TAP TO START', W / 2, H / 2 + 20);
        }
        ctx.fillStyle = '#aaa'; ctx.font = '10px monospace';
        ctx.fillText('↑ / Space = Jump     ↓ = Duck     Double Tap = Air Jump', W / 2, H / 2 + 40);

        if (e.market) {
            const mStr = e.market.getDisplayString();
            if (mStr) {
                const mode = e.market.getMode();
                const modeLabel = mode === 'bull' ? '🐂 BULL MARKET' : mode === 'bear' ? '🐻 BEAR MARKET' : '';
                ctx.fillStyle = e.market.getColor();
                ctx.font = 'bold 10px monospace';
                ctx.fillText(mStr + (modeLabel ? '  ' + modeLabel : ''), W / 2, H / 2 + 58);
            }
        }

        // Tier perks display (grayed if not connected)
        const tier = e.wallet?.isConnected() ? e.wallet.getTier() : null;
        if (tier?.name) {
            ctx.fillStyle = tier.color; ctx.font = 'bold 9px monospace';
            ctx.fillText(`[${tier.name}] TIER ACTIVE – ${tier.perks[0] || ''}`, W / 2, H / 2 + 74);
        } else {
            ctx.fillStyle = '#555'; ctx.font = '8px monospace';
            ctx.fillText('🔒 Connect $PUNCH wallet for WHALE / HOLDER / DEGEN perks', W / 2, H / 2 + 74);
        }

        // Wallet button
        if (e.wallet?.hasWallet()) {
            const connected = e.wallet.isConnected();
            const walletTier = connected ? e.wallet.getTier() : null;
            const btnLabel = connected ? `🔗 ${e.wallet.getShortAddress()}` : '🔓 CONNECT WALLET';
            const btnColor = connected ? (walletTier?.color || '#22c55e') : '#888';
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath(); ctx.roundRect(10, H - 30, 160, 20, 4); ctx.fill();
            ctx.fillStyle = btnColor; ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(btnLabel, 16, H - 20);
            if (connected && walletTier?.name) {
                ctx.fillStyle = walletTier.color;
                ctx.fillText(`  [${walletTier.name}]`, 16 + ctx.measureText(btnLabel).width + 2, H - 20);
            }
        }

        ctx.restore();
    }

    // ─── GAME OVER: Crypto Wallet Card ──────────────────────────────────────
    drawGameOver(ctx, data, gameUrl) {
        const e = this.engine;
        const W = e.W, H = e.H;

        ctx.fillStyle = 'rgba(20,25,15,0.92)';
        ctx.fillRect(0, 0, W, H);

        const cW = 340, cH = 240;
        const cx = W / 2 - cW / 2, cy = 18;
        ctx.fillStyle = '#1a2310';
        ctx.beginPath(); ctx.roundRect(cx, cy, cW, cH, 10); ctx.fill();
        ctx.strokeStyle = '#3b4a1f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(cx, cy, cW, cH, 10); ctx.stroke();

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#8b9a6b'; ctx.font = 'bold 10px monospace';
        ctx.fillText('⚔️ TRENCH WALLET ⚔️', W / 2, cy + 18);
        ctx.fillStyle = '#556b2f'; ctx.fillRect(cx + 20, cy + 28, cW - 40, 1);

        ctx.fillStyle = '#c8d8a0'; ctx.font = 'bold 22px monospace';
        ctx.fillText(`$${Math.floor(data.score).toLocaleString()}`, W / 2, cy + 50);
        ctx.fillStyle = '#6b8050'; ctx.font = '9px monospace';
        ctx.fillText('TOTAL EARNINGS', W / 2, cy + 66);
        ctx.fillStyle = '#556b2f'; ctx.fillRect(cx + 20, cy + 74, cW - 40, 1);

        const items = [
            { icon: '₿', label: 'BTC', count: data.btc || 0, val: data.btcVal || 0, color: '#F7931A' },
            { icon: '◆', label: 'ETH', count: data.eth || 0, val: data.ethVal || 0, color: '#627EEA' },
            { icon: 'S', label: 'SOL', count: data.sol || 0, val: data.solVal || 0, color: '#9945FF' },
        ];
        items.forEach((item, i) => {
            const ly = cy + 88 + i * 26;
            ctx.fillStyle = item.color;
            ctx.beginPath(); ctx.arc(cx + 38, ly, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
            ctx.fillText(item.icon, cx + 38, ly + 1);
            ctx.textAlign = 'left'; ctx.fillStyle = '#a0b080'; ctx.font = '11px monospace';
            ctx.fillText(`${item.label}  ×${item.count}`, cx + 54, ly + 1);
            ctx.textAlign = 'right'; ctx.fillStyle = '#c8d8a0'; ctx.font = 'bold 12px monospace';
            ctx.fillText(`$${item.val}`, cx + cW - 28, ly + 1);
        });

        ctx.fillStyle = '#556b2f'; ctx.fillRect(cx + 20, cy + 162, cW - 40, 1);
        ctx.textAlign = 'center'; ctx.fillStyle = '#6b8050'; ctx.font = '9px monospace';
        ctx.fillText(`TIME: ${Math.floor(data.time)}s  |  STREAK: ${data.streak}  |  BEST: ${data.best}`, W / 2, cy + 176);
        ctx.fillStyle = '#556b2f'; ctx.fillRect(cx + 20, cy + 186, cW - 40, 1);

        const btnY = cy + 198;
        this._drawWalletButton(ctx, W / 2 - 155, btnY, 96, 26, '▶ RESTART', '#3b4a1f', '#8b9a6b');
        if (!this.embedMode) {
            this._drawWalletButton(ctx, W / 2 - 48, btnY, 96, 26, '🐦 SHARE', '#1a3a5c', '#60a5fa');
            this._drawWalletButton(ctx, W / 2 + 58, btnY, 80, 26, '📋 COPY', '#3b4a1f', '#8b9a6b');
            this._drawWalletButton(ctx, W / 2 + 148, btnY, 96, 26, '📸 CARD', '#4a2a00', '#F7931A');
        }
    }

    // ─── RANKING ─────────────────────────────────────────────────────────────
    drawRanking(ctx, data) {
        const e = this.engine;
        const W = e.W, H = e.H;

        ctx.fillStyle = 'rgba(8,14,4,0.97)';
        ctx.fillRect(0, 0, W, H);

        // Compact wallet header
        const hH = 44;
        ctx.fillStyle = '#1a2310'; ctx.fillRect(0, 0, W, hH);
        ctx.fillStyle = '#3b4a1f'; ctx.fillRect(0, hH, W, 1);

        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#8b9a6b'; ctx.font = 'bold 9px monospace';
        ctx.fillText('⚔️ TRENCH WALLET', 10, 12);
        ctx.fillStyle = '#c8d8a0'; ctx.font = 'bold 20px monospace';
        ctx.fillText(`$${Math.floor(data.score).toLocaleString()}`, 10, 32);

        // Tier badge in header (BUG FIX area: always shown before early returns)
        const tier = e.wallet?.isConnected() ? e.wallet.getTier() : null;
        if (tier?.name) {
            ctx.fillStyle = tier.color; ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            ctx.fillText(`[${tier.name}]`, W / 2 - 5, 2);
        }

        const cryptos = [
            { icon: '₿', count: data.btc || 0, val: data.btcVal || 0, color: '#F7931A' },
            { icon: '◆', count: data.eth || 0, val: data.ethVal || 0, color: '#627EEA' },
            { icon: 'S', count: data.sol || 0, val: data.solVal || 0, color: '#9945FF' },
        ];
        cryptos.forEach((c, i) => {
            const bx = 200 + i * 105;
            ctx.fillStyle = c.color;
            ctx.beginPath(); ctx.arc(bx, 16, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center';
            ctx.fillText(c.icon, bx, 17);
            ctx.textAlign = 'left'; ctx.fillStyle = '#a0b080'; ctx.font = '9px monospace';
            ctx.fillText(`×${c.count}  $${c.val}`, bx + 11, 17);
        });
        ctx.fillStyle = '#6b8050'; ctx.font = '8px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`TIME ${Math.floor(data.time)}s  |  🔥${data.streak}  |  BEST $${data.best}`, 200, 35);

        // ── BUG FIX: Always draw action buttons BEFORE early-exit guards ──────
        this._drawWalletButton(ctx, W - 104, 9, 96, 26, '▶ RESTART', '#3b4a1f', '#8b9a6b');
        if (!this.embedMode) {
            this._drawWalletButton(ctx, W - 210, 9, 96, 26, '🐦 SHARE', '#1a3a5c', '#60a5fa');
        }

        // Tab buttons
        const localActive = this._lbTab === 'local';
        const globalActive = this._lbTab === 'global';
        const tabW = 70, tabH = 18, tabY = hH + 5;
        ctx.fillStyle = localActive ? '#3b4a1f' : '#111';
        ctx.beginPath(); ctx.roundRect(10, tabY, tabW, tabH, 4); ctx.fill();
        ctx.fillStyle = localActive ? '#8b9a6b' : '#444';
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏠 LOCAL', 10 + tabW / 2, tabY + tabH / 2);
        ctx.fillStyle = globalActive ? '#1a3a5c' : '#111';
        ctx.beginPath(); ctx.roundRect(88, tabY, tabW, tabH, 4); ctx.fill();
        ctx.fillStyle = globalActive ? '#60a5fa' : '#444';
        ctx.fillText('🌍 GLOBAL', 88 + tabW / 2, tabY + tabH / 2);

        // Table header
        const tY = hH + 28;
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏆  TOP 25 TRENCH SURVIVORS  🏆', W / 2, tY + 8);
        ctx.fillStyle = '#2d3a10'; ctx.fillRect(10, tY + 16, W - 20, 1);

        const hy = tY + 24;
        const cX = { rank: 20, name: 38, score: 220, time: 330, coins: 388, streak: 440, date: 495 };
        ctx.fillStyle = '#2d3a10'; ctx.font = '7px monospace'; ctx.textAlign = 'left';
        ['#', 'NAME', 'SCORE', 'TIME', '🪙', '🔥', 'DATE'].forEach((h, i) => {
            const keys = ['rank', 'name', 'score', 'time', 'coins', 'streak', 'date'];
            ctx.fillText(h, cX[keys[i]], hy);
        });
        ctx.fillStyle = '#1e2a10'; ctx.fillRect(10, hy + 5, W - 20, 1);

        // ── Early-exit guards come AFTER buttons are drawn ────────────────────
        if (this._lbTab === 'global') {
            if (this._globalLoading) {
                ctx.fillStyle = '#60a5fa'; ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('⏳ Loading global leaderboard...', W / 2, tY + 50);
                return;
            }
            if (this._globalEntries === null) {
                ctx.fillStyle = '#ef4444'; ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('🔴 Server offline', W / 2, tY + 45);
                ctx.fillStyle = '#888'; ctx.font = '9px monospace';
                ctx.fillText(`Server: ${window.PUNCH_SERVER || 'not configured'}`, W / 2, tY + 62);
                return;
            }
        }

        const entries = this._lbTab === 'global' ? (this._globalEntries || []) : (data.leaderboard || []);
        const playerScore = Math.floor(data.score);
        const playerName = (data.playerName || '').trim() || 'Anonymous';
        const rowH = 9;

        for (let i = 0; i < Math.min(entries.length, 25); i++) {
            const en = entries[i];
            const ry = hy + 8 + i * rowH;
            const isMe = Math.floor(en.score) === playerScore && en.name === playerName;

            if (isMe) {
                ctx.fillStyle = 'rgba(85,107,47,0.28)';
                ctx.fillRect(10, ry - 5, W - 20, rowH);
            }

            const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : (isMe ? '#c8d8a0' : '#4a6030');
            ctx.fillStyle = rankColor;
            ctx.font = i < 3 ? 'bold 8px monospace' : '7px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${i + 1}`, cX.name - 4, ry);

            ctx.textAlign = 'left';
            ctx.fillStyle = isMe ? '#c8d8a0' : (i < 3 ? rankColor : '#8ba070');
            ctx.font = isMe ? 'bold 8px monospace' : '8px monospace';
            ctx.fillText(en.name.slice(0, 22), cX.name, ry);

            ctx.textAlign = 'right';
            ctx.fillStyle = isMe ? '#ffd700' : '#c8d8a0';
            ctx.font = 'bold 8px monospace';
            ctx.fillText(`$${en.score.toLocaleString()}`, cX.time - 8, ry);

            ctx.fillStyle = '#556b2f'; ctx.font = '7px monospace'; ctx.textAlign = 'left';
            ctx.fillText(`${en.time}s`, cX.time, ry);
            ctx.fillStyle = '#c08020';
            ctx.fillText(`${en.plush || 0}`, cX.coins, ry);
            ctx.fillStyle = '#b04010';
            ctx.fillText(`${en.streak || 0}`, cX.streak, ry);

            if (en.date) {
                const d = new Date(en.date);
                const ds = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
                ctx.fillStyle = '#3b4a1f'; ctx.font = '7px monospace';
                ctx.fillText(ds, cX.date, ry);
            }

            if (i < entries.length - 1) {
                ctx.fillStyle = '#141e08';
                ctx.fillRect(10, ry + rowH - 4, W - 20, 1);
            }
        }

        if (entries.length === 0) {
            ctx.fillStyle = '#3b4a1f'; ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('No scores yet — be the first!', W / 2, tY + 50);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    _drawWalletButton(ctx, x, y, w, h, label, bg, textColor) {
        ctx.save();
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fill();
        ctx.strokeStyle = textColor + '44'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.stroke();
        ctx.fillStyle = textColor; ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w / 2, y + h / 2);
        ctx.restore();
    }

    _drawButton(ctx, x, y, w, h, label, fill, shadow) {
        ctx.save();
        ctx.shadowColor = shadow; ctx.shadowBlur = 8;
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText(label, x + w / 2, y + h / 2);
        ctx.restore();
    }

    // ─── Hit-test buttons ────────────────────────────────────────────────────
    hitTestGameOver(mx, my) {
        const e = this.engine;
        const W = e.W;
        const rect = e.canvas.getBoundingClientRect();
        const scaleX = e.canvas.clientWidth / W;
        const scaleY = e.canvas.clientHeight / e.H;
        const cx = (mx - rect.left) / scaleX;
        const cy = (my - rect.top) / scaleY;

        const btnY = 216;
        const hit = (x, y, w, h) => cx >= x && cx <= x + w && cy >= y && cy <= y + h;
        if (hit(W / 2 - 155, btnY, 96, 26)) return 'restart';
        if (!this.embedMode) {
            if (hit(W / 2 - 48, btnY, 96, 26)) return 'share';
            if (hit(W / 2 + 58, btnY, 80, 26)) return 'copy';
            if (hit(W / 2 + 148, btnY, 96, 26)) return 'card';
        }

        // RANKING header buttons
        if (hit(W - 104, 9, 96, 26)) return 'restart';
        if (!this.embedMode && hit(W - 210, 9, 96, 26)) return 'share';

        // Tab buttons
        const tabY = 49;
        if (hit(10, tabY, 70, 18)) return 'tab_local';
        if (hit(88, tabY, 70, 18)) return 'tab_global';

        // Mobile JUMP / DUCK areas (during gameplay – handled separately in setupTouch)
        return null;
    }

    /** Returns mobile hit zone for runtime touch handling */
    getMobileHitZones(W, H) {
        return {
            jump: { x: W - 90, y: H - 65, w: 80, h: 48 },
            duck: { x: 10, y: H - 65, w: 80, h: 48 },
        };
    }

    toggleLeaderboard() { this._showLB = !this._showLB; }
}
