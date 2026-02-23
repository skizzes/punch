// src/spawnDirector.js – Organic spawning with varied gaps, coin patterns, and proper duck obstacles
import { PU } from './powerups.js';

// ─── Obstacle templates ──────────────────────────────────────────────────────
// Duck obstacles: come in LOW (floatAbove=32) → player MUST duck to pass
// Jump obstacles: ground candles → player MUST jump
const OBS_TYPES = [
    { id: 'greencandle', w: 18, h: 70, ground: true },
    { id: 'redcandle', w: 18, h: 55, ground: true },
    { id: 'tallcandle', w: 18, h: 100, ground: true },           // NEW: very tall, jump high
    { id: 'duck_bar', w: 75, h: 18, ground: false, floatAbove: 28 }, // NEW: low aerial → must duck
    { id: 'flyingbar', w: 65, h: 18, ground: false, floatAbove: 80 }, // high aerial → jump+duck OR run under
];

// ─── Coin templates ──────────────────────────────────────────────────────────
const COIN_TYPES = [
    { id: 'btc', pts: 100, color: '#F7931A', rim: '#c4700d', w: 24, h: 24, wt: 20 },
    { id: 'eth', pts: 50, color: '#627EEA', rim: '#4059c2', w: 22, h: 22, wt: 35 },
    { id: 'sol', pts: 25, color: '#9945FF', rim: '#6a24cc', w: 20, h: 20, wt: 45 },
];

// ─── Power-up templates ─────────────────────────────────────────────────────
const PU_TYPES = [
    { type: PU.SHIELD, wt: 30 },
    { type: PU.MAGNET, wt: 25 },
    { type: PU.SLOWTIME, wt: 20 },
    { type: PU.PUMP, wt: 10 },
    { type: PU.BULL, wt: 15 },  // NEW: Bull Market
];

// Smaller patterns: 2-3 coins max, well spaced
const COIN_PATTERNS = [
    [{ dx: 0, dy: -40 }],                                          // single low
    [{ dx: 0, dy: -70 }],                                          // single high
    [{ dx: 0, dy: -40 }, { dx: 38, dy: -40 }],                         // pair on ground
    [{ dx: 0, dy: -40 }, { dx: 30, dy: -74 }],                         // ground + float
    [{ dx: 0, dy: -70 }, { dx: 34, dy: -70 }, { dx: 68, dy: -70 }],        // short mid-air trail
    [{ dx: 0, dy: -40 }, { dx: 30, dy: -66 }, { dx: 60, dy: -92 }],        // staircase up
    [{ dx: 0, dy: -92 }, { dx: 30, dy: -66 }, { dx: 60, dy: -40 }],        // staircase down
    [{ dx: 0, dy: -60 }, { dx: 52, dy: -60 }],                         // spaced pair
];

const BULL_COIN_GAP = 85; // px between rain coins during bull market

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function wRandom(items) {
    let r = Math.random() * items.reduce((s, i) => s + i.wt, 0);
    for (const it of items) { r -= it.wt; if (r <= 0) return it; }
    return items[items.length - 1];
}
function mkObs() { return { x: 0, y: 0, w: 0, h: 0, type: '', active: false }; }
function mkCoin() { return { x: 0, y: 0, w: 0, h: 0, color: '', rim: '', type: '', pts: 0, ft: 0, active: false }; }
function mkPU() { return { x: 0, y: 0, r: 12, type: '', active: false }; }

// ─── SpawnDirector ──────────────────────────────────────────────────────────
export class SpawnDirector {
    constructor(engine) {
        this.engine = engine;
        this.W = engine.W;
        this.groundY = engine.groundY;
        this._obsPool = []; this._coPool = []; this._puPool = [];
        this.reset();
    }

    reset() {
        this.activeObs = [];
        this.activeCoins = [];
        this.activePU = [];
        this.dist = 0;
        this.nextObs = 550;
        this.nextCoin = 500;
        this.nextPU = this._puDelay();
        this.lastObsId = null;
        this._wavePhase = 'normal'; // 'normal' | 'burst' | 'calm'
        this._waveTimer = 0;

        // Keep activePlush as alias for activeCoins (game.js uses activePlush)
        Object.defineProperty(this, 'activePlush', {
            get: () => this.activeCoins, set: v => { this.activeCoins = v; },
            configurable: true,
        });
    }

    _puDelay() { return this.dist + 5000 + rnd(3000, 6000); }

    // ── Organic gap system ───────────────────────────────────────────────────
    // Wave phases: normal → occasionally burst (many close together) → calm (long gap)
    _obsGap(sp) {
        const base = Math.max(1.0, 2.5 - (sp - 310) / 500 * 1.3);
        let mult;
        switch (this._wavePhase) {
            case 'burst': mult = rnd(0.55, 0.80); break;
            case 'calm': mult = rnd(2.0, 4.0); break;
            default: mult = rnd(0.85, 1.8); break;
        }
        return sp * base * mult;
    }

    _coinGap(sp) {
        // Wider gaps so individual patterns feel earned
        return sp * rnd(2.5, 4.5);
    }

    _tickWave(dt) {
        this._waveTimer -= dt;
        if (this._waveTimer <= 0) {
            // Pick next phase randomly
            const r = Math.random();
            if (r < 0.25) {
                this._wavePhase = 'burst';
                this._waveTimer = rnd(3, 6);
            } else if (r < 0.45) {
                this._wavePhase = 'calm';
                this._waveTimer = rnd(2, 5);
            } else {
                this._wavePhase = 'normal';
                this._waveTimer = rnd(4, 10);
            }
        }
    }

    _getObs() { return this._obsPool.pop() || mkObs(); }
    _getCoin() { return this._coPool.pop() || mkCoin(); }
    _getPU() { return this._puPool.pop() || mkPU(); }

    // ── Obstacle spawner ─────────────────────────────────────────────────────
    _spawnObs(sp) {
        const sx = this.W + 60;

        // Avoid repeating aerial duck twice in a row
        let options = OBS_TYPES;
        if (this.lastObsId === 'duck_bar') {
            options = OBS_TYPES.filter(o => o.id !== 'duck_bar');
        }
        // Avoid repeating same ground candle twice in a row
        if (this.lastObsId === 'flyingbar') {
            options = OBS_TYPES.filter(o => o.id !== 'flyingbar');
        }

        // At low speed (early game) don't spawn duck_bar yet — player needs time to learn
        if (sp < 380) options = options.filter(o => o.id !== 'duck_bar');

        const tmpl = pick(options);
        this.lastObsId = tmpl.id;

        const spawnOne = (offsetX = 0, heightVariance = 0) => {
            const o = this._getObs();
            o.x = sx + offsetX;
            o.y = tmpl.ground
                ? this.groundY - tmpl.h - heightVariance
                : this.groundY - tmpl.floatAbove - tmpl.h;
            o.w = tmpl.w; o.h = tmpl.h; o.type = tmpl.id; o.active = true;
            this.activeObs.push(o);
        };

        spawnOne(0);

        // Occasional double-candle cluster (only ground obstacles)
        if (sp > 420 && tmpl.ground && Math.random() < 0.25) {
            spawnOne(tmpl.w + ~~rnd(10, 22));
        }

        // Rare triple in burst phase
        if (this._wavePhase === 'burst' && sp > 550 && tmpl.ground && Math.random() < 0.18) {
            spawnOne(tmpl.w * 2 + ~~rnd(20, 40));
        }
    }

    // ── Coin pattern spawner ─────────────────────────────────────────────────
    _spawnCoin() {
        const pattern = pick(COIN_PATTERNS);
        const startX = this.W + 40;

        for (const p of pattern) {
            // Occasionally pick a random coin type per-coin, or use the same type for the whole pattern
            const tmpl = wRandom(COIN_TYPES);
            const c = this._getCoin();
            c.w = tmpl.w; c.h = tmpl.h;
            c.color = tmpl.color; c.rim = tmpl.rim;
            c.type = tmpl.id; c.pts = tmpl.pts;
            c.x = startX + p.dx;
            c.y = this.groundY + p.dy - c.h / 2;
            c.ft = rnd(0, Math.PI * 2); // random float phase so they don't all bob in sync
            c.active = true;
            this.activeCoins.push(c);
        }
    }

    _spawnPU() {
        const tmpl = wRandom(PU_TYPES);
        const pu = this._getPU();
        pu.type = tmpl.type; pu.x = this.W + 40;
        pu.y = this.groundY - rnd(80, 110); pu.r = 12; pu.active = true;
        this.activePU.push(pu);
    }

    _recycle(arr, pool, thr = -90) {
        for (let i = arr.length - 1; i >= 0; i--)
            if (arr[i].x < thr) pool.push(arr.splice(i, 1)[0]);
    }

    update(dt, speed) {
        const dx = speed * dt;
        this.dist += dx;
        this._tickWave(dt);

        for (const o of this.activeObs) o.x -= dx;
        for (const c of this.activeCoins) { c.x -= dx; c.ft += dt; c.y += Math.sin(c.ft * 2.4) * 0.45; }
        for (const pu of this.activePU) pu.x -= dx;

        this._recycle(this.activeObs, this._obsPool);
        this._recycle(this.activeCoins, this._coPool);
        this._recycle(this.activePU, this._puPool);

        if (this.dist >= this.nextObs) { this._spawnObs(speed); this.nextObs = this.dist + this._obsGap(speed); }

        // Bull market: rapid single-coin rain, tracked separately via countdown in px
        const bullOn = this.engine.powerups?.bullActive;
        if (bullOn) {
            this._bullCoinCD = (this._bullCoinCD ?? 0) - dx;
            if (this._bullCoinCD <= 0) { this._spawnBullCoin(); this._bullCoinCD = BULL_COIN_GAP; }
        } else {
            if (this.dist >= this.nextCoin) { this._spawnCoin(); this.nextCoin = this.dist + this._coinGap(speed); }
        }

        if (this.dist >= this.nextPU) { this._spawnPU(); this.nextPU = this._puDelay(); }
    }

    removePlush(c) { const i = this.activeCoins.indexOf(c); if (i >= 0) this._coPool.push(this.activeCoins.splice(i, 1)[0]); }
    removePU(pu) { const i = this.activePU.indexOf(pu); if (i >= 0) this._puPool.push(this.activePU.splice(i, 1)[0]); }

    _spawnBullCoin() {
        const tmpl = wRandom(COIN_TYPES);
        const c = this._getCoin();
        c.w = tmpl.w; c.h = tmpl.h; c.color = tmpl.color; c.rim = tmpl.rim;
        c.type = tmpl.id; c.pts = tmpl.pts;
        c.x = this.W + 40;
        c.y = this.groundY - rnd(36, 105) - c.h / 2;
        c.ft = rnd(0, Math.PI * 2);
        c.active = true;
        this.activeCoins.push(c);
    }

    obsHB(o) { const s = 4; return { x: o.x + s, y: o.y + s, w: o.w - s * 2, h: o.h - s * 2 }; }
    plushHB(c) { return { x: c.x, y: c.y, w: c.w, h: c.h }; }
    puHB(pu) { return { x: pu.x - pu.r, y: pu.y - pu.r, w: pu.r * 2, h: pu.r * 2 }; }

    // ─── Rendering ───────────────────────────────────────────────────────────
    draw(ctx, t) {

        // ── OBSTACLES ────────────────────────────────────────────────────────
        for (const o of this.activeObs) {
            const ox = ~~o.x, oy = ~~o.y;

            if (o.type === 'greencandle' || o.type === 'tallcandle') {
                const wickX = ox + ~~(o.w / 2) - 1;
                ctx.fillStyle = '#1a6b1a';
                ctx.fillRect(wickX, oy, 3, 12);
                ctx.fillStyle = '#22c55e';
                ctx.fillRect(ox, oy + 12, o.w, o.h - 12);
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fillRect(ox + 2, oy + 14, 5, o.h - 18);
                ctx.strokeStyle = '#15803d'; ctx.lineWidth = 1;
                ctx.strokeRect(ox, oy + 12, o.w, o.h - 12);
            }

            else if (o.type === 'redcandle') {
                const wickX = ox + ~~(o.w / 2) - 1;
                ctx.fillStyle = '#991b1b';
                ctx.fillRect(wickX, oy + o.h - 10, 3, 10);
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(ox, oy, o.w, o.h - 10);
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.fillRect(ox, oy, o.w, 6);
                ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 1;
                ctx.strokeRect(ox, oy, o.w, o.h - 10);
            }

            else if (o.type === 'duck_bar') {
                // LOW aerial bar — bright orange/yellow warning stripe so player notices
                ctx.fillStyle = '#ffaa00';
                ctx.fillRect(ox + 6, oy + 2, o.w - 12, o.h - 4);
                // Warning stripes
                ctx.fillStyle = '#000';
                for (let s = 0; s < o.w - 12; s += 14) {
                    ctx.fillRect(ox + 6 + s, oy + 2, 6, o.h - 4);
                }
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#ffcc44';
                ctx.fillRect(ox + 6, oy + 2, o.w - 12, o.h - 4);
                ctx.globalAlpha = 1;
                // Left/right wicks
                ctx.fillStyle = '#cc7700';
                ctx.fillRect(ox, oy + ~~(o.h / 2) - 1, 8, 3);
                ctx.fillRect(ox + o.w - 8, oy + ~~(o.h / 2) - 1, 8, 3);
                ctx.strokeStyle = '#cc7700'; ctx.lineWidth = 1.5;
                ctx.strokeRect(ox + 6, oy + 2, o.w - 12, o.h - 4);
                // DUCK label
                ctx.fillStyle = '#3a2200'; ctx.font = 'bold 8px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('DUCK', ox + o.w / 2, oy + o.h / 2);
            }

            else if (o.type === 'flyingbar') {
                // HIGH aerial — red
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(ox + 8, oy + 2, o.w - 16, o.h - 4);
                ctx.fillStyle = '#991b1b';
                ctx.fillRect(ox, oy + ~~(o.h / 2) - 1, 10, 3);
                ctx.fillRect(ox + o.w - 10, oy + ~~(o.h / 2) - 1, 10, 3);
                ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 1;
                ctx.strokeRect(ox + 8, oy + 2, o.w - 16, o.h - 4);
            }
        }

        // ── COINS ─────────────────────────────────────────────────────────────
        for (const c of this.activeCoins) {
            const cx2 = ~~c.x + c.w / 2, cy2 = ~~c.y + c.h / 2, r = c.w / 2;
            ctx.fillStyle = c.rim;
            ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = c.color;
            ctx.beginPath(); ctx.arc(cx2, cy2, r - 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.ellipse(cx2 - r * 0.25, cy2 - r * 0.3, r * 0.4, r * 0.25, -0.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

            if (c.type === 'btc') {
                ctx.font = `bold ${r * 1.2}px Arial`;
                ctx.fillText('₿', cx2, cy2 + 1);
            } else if (c.type === 'eth') {
                ctx.beginPath();
                ctx.moveTo(cx2, cy2 - r * 0.65);
                ctx.lineTo(cx2 + r * 0.45, cy2);
                ctx.lineTo(cx2, cy2 + r * 0.65);
                ctx.lineTo(cx2 - r * 0.45, cy2);
                ctx.closePath();
                ctx.fillStyle = '#fff'; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(cx2 - r * 0.35, cy2); ctx.lineTo(cx2 + r * 0.35, cy2); ctx.stroke();
            } else {
                ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
                const sw = r * 0.55, sh = r * 0.2;
                for (let i = -1; i <= 1; i++) {
                    const ly = cy2 + i * (r * 0.35);
                    ctx.beginPath(); ctx.moveTo(cx2 - sw, ly + sh * 0.3); ctx.lineTo(cx2 + sw, ly - sh * 0.3); ctx.stroke();
                }
            }
        }

        // ── POWER-UPS ─────────────────────────────────────────────────────────
        const PU_INFO = {
            shield: { color: '#556b2f', glow: '#6b8e23', icon: '🪖' },
            magnet: { color: '#c084fc', glow: '#a855f7', icon: '🧲' },
            slowtime: { color: '#60a5fa', glow: '#3b82f6', icon: '⏰' },
        };

        for (const pu of this.activePU) {
            const pulse = 1 + Math.sin(t * 3) * 0.09;
            const pr = ~~(pu.r * pulse);

            if (pu.type === 'bull') {
                // ── Bull head token ──
                const bx = ~~pu.x, by = ~~pu.y;
                ctx.save();
                ctx.shadowColor = '#F7931A'; ctx.shadowBlur = 14;
                // Gold rim
                ctx.fillStyle = '#c47700';
                ctx.beginPath(); ctx.arc(bx, by, pr + 2, 0, Math.PI * 2); ctx.fill();
                // Brown head
                ctx.fillStyle = '#8B4513';
                ctx.beginPath(); ctx.arc(bx, by, pr, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                // Horns
                ctx.strokeStyle = '#5a2a00'; ctx.lineWidth = 3; ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(bx - pr * 0.5, by - pr * 0.4);
                ctx.quadraticCurveTo(bx - pr * 1.0, by - pr * 1.2, bx - pr * 0.7, by - pr * 1.5);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(bx + pr * 0.5, by - pr * 0.4);
                ctx.quadraticCurveTo(bx + pr * 1.0, by - pr * 1.2, bx + pr * 0.7, by - pr * 1.5);
                ctx.stroke();
                // Nose
                ctx.fillStyle = '#704020';
                ctx.beginPath(); ctx.ellipse(bx, by + pr * 0.35, pr * 0.45, pr * 0.28, 0, 0, Math.PI * 2); ctx.fill();
                // Nostrils
                ctx.fillStyle = '#3a1a00';
                ctx.beginPath(); ctx.arc(bx - pr * 0.18, by + pr * 0.35, pr * 0.1, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(bx + pr * 0.18, by + pr * 0.35, pr * 0.1, 0, Math.PI * 2); ctx.fill();
                // Eyes
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(bx - pr * 0.28, by - pr * 0.1, pr * 0.15, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(bx + pr * 0.28, by - pr * 0.1, pr * 0.15, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(bx - pr * 0.28, by - pr * 0.1, pr * 0.07, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(bx + pr * 0.28, by - pr * 0.1, pr * 0.07, 0, Math.PI * 2); ctx.fill();
                // Label
                ctx.fillStyle = '#fff'; ctx.font = 'bold 7px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.fillText('BULL', bx, by + pr + 3);
                ctx.restore();

            } else if (pu.type === 'pump') {
                const pw = ~~(pr * 2.2), ph = ~~(pr * 1.2);
                const px3 = ~~pu.x - pw / 2, py3 = ~~pu.y - ph / 2, hr = ~~(ph / 2);
                ctx.save();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(px3 + hr, py3); ctx.lineTo(px3 + pw - hr, py3);
                ctx.arc(px3 + pw - hr, py3 + hr, hr, -Math.PI / 2, Math.PI / 2);
                ctx.lineTo(px3 + hr, py3 + ph);
                ctx.arc(px3 + hr, py3 + hr, hr, Math.PI / 2, -Math.PI / 2);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#00c853';
                ctx.beginPath();
                ctx.moveTo(px3 + hr, py3); ctx.lineTo(px3 + pw / 2, py3);
                ctx.lineTo(px3 + pw / 2, py3 + ph); ctx.lineTo(px3 + hr, py3 + ph);
                ctx.arc(px3 + hr, py3 + hr, hr, Math.PI / 2, -Math.PI / 2);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#00a844'; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(px3 + hr, py3); ctx.lineTo(px3 + pw - hr, py3);
                ctx.arc(px3 + pw - hr, py3 + hr, hr, -Math.PI / 2, Math.PI / 2);
                ctx.lineTo(px3 + hr, py3 + ph);
                ctx.arc(px3 + hr, py3 + hr, hr, Math.PI / 2, -Math.PI / 2);
                ctx.closePath(); ctx.stroke();
                ctx.fillStyle = '#004a1e'; ctx.font = 'bold 5px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('PUMP', ~~pu.x, ~~pu.y);
                ctx.restore();
            } else {
                const info = PU_INFO[pu.type] || { color: '#888', glow: '#666', icon: '?' };
                ctx.save();
                ctx.shadowColor = info.glow; ctx.shadowBlur = 10;
                ctx.fillStyle = info.color + '44';
                ctx.beginPath(); ctx.arc(~~pu.x, ~~pu.y, pr * 1.3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = info.color;
                ctx.beginPath(); ctx.arc(~~pu.x, ~~pu.y, pr, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(info.icon, ~~pu.x, ~~pu.y);
                ctx.restore();
            }
        }
    }
}
