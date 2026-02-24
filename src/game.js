// src/game.js – GameEngine: RAF loop, state machine, background, physics, scoring
import { Player } from './player.js';
import { SpawnDirector } from './spawnDirector.js';
import { PowerupManager } from './powerups.js';
import { UIManager } from './ui.js';
import { StorageManager } from './storage.js';
import { MarketWatcher } from './market.js';
import { showShareCard } from './shareCard.js';
import { WalletManager } from './wallet.js';
import { AudioManager } from './audio.js';

// ─── AABB collision ────────────────────────────────────────────────────────
function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ─── Chrome Dino style ───────────────────────────────────────────────────
// White background, gray clouds, simple ground line with pebbles

export class GameEngine {
    constructor(config = {}) {
        this.embedMode = config.embedMode || false;
        this.gameUrl = config.gameUrl || 'http://localhost';

        // Canvas
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.W = 800;
        this.H = 300;
        this.canvas.width = this.W;
        this.canvas.height = this.H;

        // Weekend detection
        const d = new Date();
        this.isWeekend = d.getDay() === 0 || d.getDay() === 6;

        // Ground scrolling offset (for pebbles)
        this.groundOffset = 0;

        // Dino-style clouds
        this.clouds = Array.from({ length: 5 }, (_, i) => ({
            x: 120 + i * 180 + Math.random() * 60,
            y: 20 + Math.random() * 55,
            w: 55 + Math.random() * 55,
        }));

        // Subsystems
        this.storage = new StorageManager();
        this.market = new MarketWatcher();   // live SOL price
        this.wallet = new WalletManager();   // Phantom / Solflare
        this.audio = new AudioManager();     // sound engine
        this.groundY = this.H - 50;
        this.player = new Player(80, this.groundY);
        this.spawn = new SpawnDirector(this);
        this.powerups = new PowerupManager(this);
        this.ui = new UIManager(this);
        this.ui.engine = this; // circular ref is fine

        // State
        this.state = 'MENU';
        this.time = 0;         // elapsed total seconds
        this.keys = {};

        // Game vars (reset each run)
        this._initRun();

        // Input
        this._setupInput();
        this._setupResize();
        this._setupTouch();
    }



    _initRun() {
        this.score = 0;
        this.survivalTime = 0;
        this.plushCount = 0;
        this.streak = 0;
        this.bestStreak = 0;
        this.comboBoostActive = false;
        this.comboBoostTimer = 0;
        this.gameSpeed = 310;  // px/s
        // Per-coin tracking
        this.btcCount = 0; this.ethCount = 0; this.solCount = 0;
        this.btcValue = 0; this.ethValue = 0; this.solValue = 0;
        this._bestPowerup = null; // track best power-up used this run
        this._jumpPressed = false; // edge-detect for double jump
        this.player.reset();
        this.spawn.reset();
        this.powerups.reset();

        // Apply token tier benefits
        const tier = this.wallet?.getTier();
        if (tier?.shield) { this.powerups.activate('shield'); }
        if (tier?.comboStart) { this.comboBoostActive = true; this.comboBoostTimer = 5; }

        this.ui.popups = [];
        this.ui.floats = [];

        // Announce tier benefits after clearing popups
        if (tier?.name && this.wallet?.isConnected()) {
            if (tier.shield) this.ui.showPopup(`🪖 SHIELD BONUS – ${tier.name} PERK`, tier.color);
            if (tier.comboStart) this.ui.showPopup(`⚡ COMBO START – ${tier.name} PERK`, tier.color);
            if (tier.bullBonus) this.ui.showPopup(`🐂 +${tier.bullBonus}s BULL BONUS`, '#F7931A');
        }

        this._gameOverData = null;
        this._lastBiomeIdx = 0;
    }

    start() {
        let last = 0;
        const loop = (ts) => {
            const dt = Math.min((ts - last) / 1000, 0.05);
            last = ts;
            if (this.state !== 'PAUSED') this.time += dt;
            this._update(dt);
            this._draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame((ts) => { last = ts; requestAnimationFrame(loop); });
    }

    togglePause() {
        if (this.state === 'RUNNING') {
            this.state = 'PAUSED';
            this.audio.pauseMusic();
        } else if (this.state === 'PAUSED') {
            this.state = 'RUNNING';
            this.audio.resumeMusic();
        }
    }

    // ─── Update ───────────────────────────────────────────────────────────────
    _update(dt) {
        if (this.state === 'PAUSED') {
            this.ui.update(dt * 0); // keep popups frozen
            return;
        }
        if (this.state === 'RUNNING') {
            // Speed curve: steep ramp in first 10s, then steady climb to 850
            const ramp = this.survivalTime < 10 ? 7 : 4.5;
            this.gameSpeed = Math.min(310 + this.survivalTime * ramp, 850);
            // Market modifier: bull = slightly slower (more coins); bear = faster (harder)
            const mktMult = this.market.getMode() === 'bull' ? 0.88
                : this.market.getMode() === 'bear' ? 1.12 : 1.0;
            const effectiveSpeed = this.gameSpeed * this.powerups.getSpeedMultiplier() * mktMult;

            this.survivalTime += dt;
            this.score += dt * this.powerups.getScoreMultiplier();  // +1 pt/s (x3 if pump active)
            this.comboBoostTimer = Math.max(0, this.comboBoostTimer - dt);
            if (this.comboBoostTimer <= 0) this.comboBoostActive = false;

            this.player.update(dt, this.keys);
            this.spawn.update(dt, effectiveSpeed);
            this.powerups.update(dt, this.player, this.spawn.activePlush);
            this.ui.update(dt);
            this._checkBiomeChange();

            // Ground scroll
            this.groundOffset = (this.groundOffset + effectiveSpeed * dt) % 60;

            // Cloud parallax (slow)
            for (const c of this.clouds) {
                c.x -= effectiveSpeed * 0.06 * dt;
                if (c.x + c.w < -10) c.x = this.W + 20 + Math.random() * 120;
            }

            this._checkCollisions();
        } else if (this.state === 'MENU') {
            this.ui.update(dt);
        } else if (this.state === 'GAMEOVER' || this.state === 'RANKING') {
            this.ui.update(dt);
        }
    }

    // ─── Collisions ───────────────────────────────────────────────────────────
    _checkCollisions() {
        const ph = this.player.getHitbox();

        // Obstacles
        for (const obs of this.spawn.activeObs) {
            if (overlaps(ph, this.spawn.obsHB(obs))) {
                if (this.powerups.shieldActive) {
                    this.powerups.breakShield();
                    this.audio.playShieldHit();
                    this.streak = 0; // BUG FIX: reset streak when shield absorbs hit
                    const i = this.spawn.activeObs.indexOf(obs);
                    if (i >= 0) { this.spawn._obsPool.push(this.spawn.activeObs.splice(i, 1)[0]); }
                    return;
                }
                this._triggerGameOver();
                return;
            }
        }

        // Plushies (coins)
        for (const pl of [...this.spawn.activePlush]) {
            if (overlaps(ph, this.spawn.plushHB(pl))) {
                this._collectPlush(pl);
            }
        }

        // Power-ups
        for (const pu of [...this.spawn.activePU]) {
            if (overlaps(ph, this.spawn.puHB(pu))) {
                this._activatePowerup(pu.type);
                this.spawn.removePU(pu);
            }
        }
    }

    /** Activate a power-up and track it for end-of-run share */
    _activatePowerup(type) {
        this.powerups.activate(type);
        // Track best power-up for share card (priority order)
        const priority = { airdrop: 0, bull: 1, pump: 2, bear: 3, shield: 4, magnet: 5, slowtime: 6 };
        const cur = priority[type] ?? 99;
        const best = priority[this._bestPowerup] ?? 99;
        if (cur < best) this._bestPowerup = type;

        // Audio feedback per powerup type
        if (type === 'airdrop') {
            this.audio.playAirdrop();
        } else {
            this.audio.playPowerup();
        }

        // AIRDROP: instant +500 pts + coin burst
        if (type === 'airdrop') {
            this.score += 500 * this.powerups.getScoreMultiplier();
            this.ui.showFloat('+500 AIRDROP!', this.player.x + this.player.w / 2, this.player.y - 10, '#ffd700');
            this.spawn._spawnAirdropBurst();
        }
    }

    _collectPlush(pl) {
        const base = pl.pts;
        const weekend = this.isWeekend ? 2 : 1;
        const combo = this.comboBoostActive ? 2 : 1;
        const pump = this.powerups.getScoreMultiplier();
        const pts = base * weekend * combo * pump;

        this.score += pts;
        this.plushCount++;
        this.streak++;
        if (this.streak > this.bestStreak) this.bestStreak = this.streak;

        // Track per-coin type
        if (pl.type === 'btc') { this.btcCount++; this.btcValue += pts; }
        else if (pl.type === 'eth') { this.ethCount++; this.ethValue += pts; }
        else if (pl.type === 'sol') { this.solCount++; this.solValue += pts; }

        // Combo trigger every 5 in a row
        if (this.streak % 5 === 0) {
            this.comboBoostActive = true;
            this.comboBoostTimer = 3;
        }

        this.audio.playCoin();
        this.ui.checkStreakMilestone(this.streak);
        this.ui.showFloat(`+${pts}`, pl.x + pl.w / 2, pl.y, pl.color || '#F7931A');

        // Coin particle burst
        this.spawn.emitCoinParticles(pl.x + pl.w / 2, pl.y + pl.h / 2, pl.color || '#F7931A');

        this.spawn.removePlush(pl);
    }

    _triggerGameOver() {
        // Death flash animation before transitioning
        this.player.triggerDeathFlash();
        this.audio.playDeath();
        this.audio.stopMusic();

        this.state = 'GAMEOVER';
        this._pendingScore = {
            score: this.score,
            time: this.survivalTime,
            plush: this.plushCount,
            streak: this.bestStreak,
        };
        this._gameOverData = {
            score: this.score,
            time: this.survivalTime,
            plush: this.plushCount,
            streak: this.bestStreak,
            best: this.storage.getBestScore(),
            btc: this.btcCount, eth: this.ethCount, sol: this.solCount,
            btcVal: this.btcValue, ethVal: this.ethValue, solVal: this.solValue,
            powerup: this._bestPowerup,
            biome: this._getBiome().name,
        };
        if (!this.embedMode) {
            this._showNameModal();
        } else {
            this._finalizeGameOver('Anonymous');
        }
    }

    _showNameModal() {
        const modal = document.getElementById('name-modal');
        const input = document.getElementById('name-input');
        const submit = document.getElementById('name-submit');
        const skip = document.getElementById('name-skip');
        const scoreEl = document.getElementById('modal-score');

        scoreEl.textContent = `$${Math.floor(this._pendingScore.score).toLocaleString()}`;
        input.value = '';
        modal.classList.remove('hidden');
        // focus with small delay so mobile keyboards open properly
        setTimeout(() => input.focus(), 80);

        const commit = (name) => {
            modal.classList.add('hidden');
            this._finalizeGameOver(name);
        };

        // one-shot listeners
        const onSubmit = () => { submit.removeEventListener('click', onSubmit); skip.removeEventListener('click', onSkip); commit(input.value); };
        const onSkip = () => { submit.removeEventListener('click', onSubmit); skip.removeEventListener('click', onSkip); commit('Anonymous'); };
        const onEnter = (e) => { if (e.key === 'Enter') { input.removeEventListener('keydown', onEnter); commit(input.value); } };

        submit.addEventListener('click', onSubmit);
        skip.addEventListener('click', onSkip);
        input.addEventListener('keydown', onEnter);
    }

    _finalizeGameOver(name) {
        // Prefer wallet address over typed name when connected
        const finalName = this.wallet?.isConnected()
            ? this.wallet.getShortAddress()
            : (name.trim() || 'Anonymous');
        this.storage.saveScore({ ...this._pendingScore, name: finalName });
        // Submit to global leaderboard (fire-and-forget)
        this.storage.submitToGlobal({ ...this._pendingScore, name: finalName })
            .then(res => { if (res?.rank) console.log(`Global rank: #${res.rank}`); });
        this._gameOverData.best = this.storage.getBestScore();
        this._gameOverData.playerName = finalName;
        this._gameOverData.leaderboard = this.storage.getLeaderboard();
        this.state = 'RANKING';
        // Play game-over jingle a beat after death sfx
        setTimeout(() => this.audio.playGameOver(), 350);
    }

    restart() {
        this._initRun();
        this.state = 'RUNNING';
        this.audio.startMusic();
        // hide modal in case it's still showing
        const modal = document.getElementById('name-modal');
        if (modal) modal.classList.add('hidden');
    }

    // ─── Draw ─────────────────────────────────────────────────────────────────
    _draw() {
        const ctx = this.ctx;
        const W = this.W, H = this.H;
        ctx.clearRect(0, 0, W, H);

        this._drawBackground(ctx, W, H);

        if (this.state !== 'MENU') {
            this.spawn.draw(ctx, this.time);
            this.player.draw(ctx, this.powerups.shieldActive, this.powerups.magnetActive);
        }

        if (this.state === 'RUNNING' || this.state === 'GAMEOVER') {
            this.ui.drawHUD(ctx);
            this.ui.drawPopups(ctx);
        }

        if (this.state === 'MENU') this.ui.drawMenu(ctx, this.time);
        if (this.state === 'GAMEOVER') this.ui.drawGameOver(ctx, this._gameOverData, this.gameUrl);
        if (this.state === 'RANKING') this.ui.drawRanking(ctx, this._gameOverData);

        // Pause overlay (drawn on top of game scene)
        if (this.state === 'PAUSED') {
            this.ui.drawHUD(ctx);
            this.ui.drawPopups(ctx);
            this._drawPauseOverlay(ctx, W, H);
        }
    }

    _drawPauseOverlay(ctx, W, H) {
        // Dim the scene
        ctx.save();
        ctx.fillStyle = 'rgba(8, 14, 4, 0.72)';
        ctx.fillRect(0, 0, W, H);

        // Panel
        const pw = 240, ph = 110;
        const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
        ctx.fillStyle = '#1a2310';
        ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 10); ctx.fill();
        ctx.strokeStyle = '#3b4a1f'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 10); ctx.stroke();

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 24px monospace';
        ctx.fillText('⏸  PAUSED', W / 2, py + 34);

        ctx.fillStyle = '#556b2f'; ctx.font = '10px monospace';
        ctx.fillText('Press  P / ESC  to resume', W / 2, py + 60);
        ctx.fillText('Score: $' + Math.floor(this.score).toLocaleString() + '  ·  Time: ' + Math.floor(this.survivalTime) + 's', W / 2, py + 80);

        ctx.restore();
    }

    // ── Scenery system: changes every 1000 pts ──────────────────────────────
    static BIOMES = [
        { name: '🌾 THE FIELDS', skyTop: '#87CEEB', skyBot: '#c8e8f8', groundTop: '#6dc040', groundMid: '#5aab32', groundLine: '#3d7022', groundDot: '#4a8c2a', cloudTint: 'rgba(255,255,255,0.92)', cloudShadow: 'rgba(180,215,240,0.35)' },
        { name: '🌙 MIDNIGHT', skyTop: '#040820', skyBot: '#0a1030', groundTop: '#1a1a2a', groundMid: '#0f0f1f', groundLine: '#555588', groundDot: '#252535', cloudTint: 'rgba(30,40,70,0.5)', cloudShadow: 'rgba(15,20,40,0.3)', fx: 'stars' },
        { name: '🟢 THE MATRIX', skyTop: '#000800', skyBot: '#001500', groundTop: '#003300', groundMid: '#002200', groundLine: '#00ff00', groundDot: '#004400', cloudTint: 'rgba(0,50,0,0.4)', cloudShadow: 'rgba(0,30,0,0.3)', fx: 'matrix' },
        { name: '🏜️ THE DESERT', skyTop: '#e8a844', skyBot: '#f0c878', groundTop: '#d4a855', groundMid: '#c49840', groundLine: '#a07830', groundDot: '#b08838', cloudTint: 'rgba(255,240,200,0.6)', cloudShadow: 'rgba(200,180,140,0.3)' },
        { name: '❄️ ARCTIC', skyTop: '#b0c4de', skyBot: '#e8eef5', groundTop: '#e8e8f0', groundMid: '#d0d0e0', groundLine: '#a0a0b0', groundDot: '#c0c0d0', cloudTint: 'rgba(240,245,255,0.9)', cloudShadow: 'rgba(180,190,210,0.3)', fx: 'snow' },
        { name: '🌋 VOLCANO', skyTop: '#2a0a0a', skyBot: '#5a1a0a', groundTop: '#3a1a0a', groundMid: '#2a0f05', groundLine: '#ff4400', groundDot: '#4a2a1a', cloudTint: 'rgba(120,60,40,0.6)', cloudShadow: 'rgba(80,30,20,0.4)', fx: 'lava' },
        { name: '🛸 DEEP SPACE', skyTop: '#000005', skyBot: '#0a0a20', groundTop: '#2a2a3a', groundMid: '#1a1a2a', groundLine: '#4a4a6a', groundDot: '#3a3a4a', cloudTint: 'rgba(60,60,100,0.3)', cloudShadow: 'rgba(30,30,60,0.2)', fx: 'stars' },
        { name: '💜 CYBERPUNK', skyTop: '#1a0030', skyBot: '#2a0050', groundTop: '#2a1040', groundMid: '#1a0830', groundLine: '#ff00ff', groundDot: '#3a1850', cloudTint: 'rgba(100,0,150,0.4)', cloudShadow: 'rgba(60,0,100,0.3)' },
        { name: '🌊 UNDERWATER', skyTop: '#003050', skyBot: '#004070', groundTop: '#002a4a', groundMid: '#001a3a', groundLine: '#0080a0', groundDot: '#003a5a', cloudTint: 'rgba(40,100,140,0.4)', cloudShadow: 'rgba(20,60,100,0.3)' },
        { name: '🔥 HELL', skyTop: '#1a0000', skyBot: '#4a0000', groundTop: '#2a0a0a', groundMid: '#1a0505', groundLine: '#ff2200', groundDot: '#3a1010', cloudTint: 'rgba(100,20,0,0.5)', cloudShadow: 'rgba(60,10,0,0.3)', fx: 'lava' },
        { name: '🌴 TROPICAL BEACH', skyTop: '#00bfff', skyBot: '#87eefd', groundTop: '#f0d060', groundMid: '#e8c040', groundLine: '#c8a020', groundDot: '#d0b030', cloudTint: 'rgba(255,255,240,0.85)', cloudShadow: 'rgba(200,230,240,0.3)', fx: 'beach' },
        { name: '⚡ ELECTRIC STORM', skyTop: '#080818', skyBot: '#101028', groundTop: '#1a1a30', groundMid: '#101020', groundLine: '#8888ff', groundDot: '#202040', cloudTint: 'rgba(40,40,100,0.6)', cloudShadow: 'rgba(20,20,60,0.4)', fx: 'storm' },
    ];

    _getBiome() {
        const idx = Math.floor(this.score / 1000) % GameEngine.BIOMES.length;
        return GameEngine.BIOMES[idx];
    }

    _checkBiomeChange() {
        const newIdx = Math.floor(this.score / 1000) % GameEngine.BIOMES.length;
        if (this._lastBiomeIdx === undefined) this._lastBiomeIdx = 0;
        if (newIdx !== this._lastBiomeIdx) {
            this._lastBiomeIdx = newIdx;
            this.ui.showPopup(GameEngine.BIOMES[newIdx].name, '#ffd700');
        }
    }

    _drawBackground(ctx, W, H) {
        const b = this._getBiome();

        // ── Sky gradient ──
        const sky = ctx.createLinearGradient(0, 0, 0, this.groundY);
        sky.addColorStop(0, b.skyTop);
        sky.addColorStop(1, b.skyBot);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, this.groundY);

        // ── Special FX (background elements drawn BEFORE clouds) ──
        if (b.fx === 'stars') this._drawStars(ctx, W);
        if (b.fx === 'matrix') this._drawMatrixRain(ctx, W);
        if (b.fx === 'snow') this._drawSnow(ctx, W);
        if (b.fx === 'bubbles') this._drawBubbles(ctx, W);
        if (b.fx === 'neon') this._drawNeonLines(ctx, W);
        if (b.fx === 'nyc') this._drawNYC(ctx, W);
        if (b.fx === 'spacex') this._drawSpaceX(ctx, W);
        if (b.fx === 'whitehouse') this._drawWhiteHouse(ctx, W);
        if (b.fx === 'nightcity') { this._drawStars(ctx, W); this._drawNightCity(ctx, W); }
        if (b.fx === 'beach') this._drawBeach(ctx, W);
        if (b.fx === 'storm') this._drawStorm(ctx, W);

        // ── Clouds ──
        for (const c of this.clouds) this._drawCloud(ctx, c.x, c.y, c.w, b);

        // ── Ground ──
        ctx.fillStyle = b.groundTop;
        ctx.fillRect(0, this.groundY, W, 6);
        ctx.fillStyle = b.groundMid;
        ctx.fillRect(0, this.groundY + 6, W, H - this.groundY - 6);
        ctx.fillStyle = b.groundLine;
        ctx.fillRect(0, this.groundY, W, 3);

        // ── Ground details ──
        ctx.fillStyle = b.groundDot;
        const off = this.groundOffset;
        for (let x = -(off % 60); x < W; x += 60) {
            ctx.fillRect(~~x, this.groundY + 9, 8, 3);
            ctx.fillRect(~~x + 26, this.groundY + 7, 5, 3);
            ctx.fillRect(~~x + 44, this.groundY + 11, 7, 3);
        }

        // ── Lava glow on ground line ──
        if (b.fx === 'lava' || b.fx === 'rubble') {
            ctx.save();
            ctx.globalAlpha = 0.3 + 0.15 * Math.sin(this.time * 3);
            ctx.fillStyle = b.groundLine;
            ctx.fillRect(0, this.groundY - 2, W, 5);
            ctx.restore();
        }
    }

    _drawCloud(ctx, x, y, w, b) {
        const h = ~~(w * 0.42);
        ctx.fillStyle = b.cloudTint;
        ctx.fillRect(~~x, ~~(y + h * 0.38), ~~w, ~~(h * 0.62));
        ctx.fillRect(~~(x + w * 0.12), ~~y, ~~(w * 0.48), ~~h);
        ctx.fillRect(~~(x + w * 0.54), ~~(y + h * 0.14), ~~(w * 0.34), ~~(h * 0.72));
        ctx.fillStyle = b.cloudShadow;
        ctx.fillRect(~~x + 2, ~~(y + h) - 2, ~~w - 4, 4);
    }

    // ── New scene renderers ────────────────────────────────────────────────────

    // 1) New York City skyline
    _drawNYC(ctx, W) {
        const gY = this.groundY;
        // Background haze
        ctx.fillStyle = 'rgba(80,100,140,0.25)';
        ctx.fillRect(0, 0, W, gY);

        // Buildings – deterministic layout
        const buildings = [
            // [x, w, h, color, windows]
            { x: 0, w: 55, h: 160, c: '#3a3a50', wc: '#ffffaa' },
            { x: 50, w: 40, h: 200, c: '#2a2a40', wc: '#aaddff' },  // Empire State style
            { x: 85, w: 25, h: 190, c: '#2a3048', wc: '#ffffcc' },
            { x: 105, w: 50, h: 130, c: '#353545', wc: '#ffeeaa' },
            { x: 150, w: 45, h: 220, c: '#222236', wc: '#aaffff' },  // Tallest (WTC style)
            { x: 190, w: 35, h: 180, c: '#2d2d42', wc: '#ffffaa' },
            { x: 220, w: 60, h: 110, c: '#404055', wc: '#ffeebb' },
            { x: 275, w: 30, h: 160, c: '#2a2a3a', wc: '#aaddff' },
            { x: 300, w: 55, h: 200, c: '#1e1e30', wc: '#ffffcc' },
            { x: 350, w: 40, h: 140, c: '#383848', wc: '#ffeeaa' },
            { x: 385, w: 70, h: 170, c: '#2a2a40', wc: '#aaffaa' },
            { x: 450, w: 35, h: 210, c: '#222238', wc: '#ffffaa' },
            { x: 480, w: 50, h: 120, c: '#404055', wc: '#aaddff' },
            { x: 525, w: 45, h: 190, c: '#2d2d44', wc: '#ffeebb' },
            { x: 565, w: 30, h: 145, c: '#353548', wc: '#ffffcc' },
            { x: 590, w: 65, h: 165, c: '#2a2a3c', wc: '#aaffff' },
            { x: 650, w: 40, h: 200, c: '#1e1e2e', wc: '#ffffaa' },
            { x: 685, w: 55, h: 130, c: '#3a3a50', wc: '#ffeeaa' },
            { x: 735, w: 35, h: 180, c: '#2a2a40', wc: '#aaddff' },
            { x: 765, w: 60, h: 155, c: '#303045', wc: '#ffffcc' },
        ];

        // Draw building bodies
        for (const b of buildings) {
            const by = gY - b.h;
            ctx.fillStyle = b.c;
            ctx.fillRect(b.x, by, b.w, b.h);
            // Window grid
            ctx.fillStyle = b.wc;
            for (let wy = by + 8; wy < gY - 4; wy += 12) {
                for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 9) {
                    // flicker some windows off
                    const seed = (wx * 7 + wy * 13) & 3;
                    if (seed !== 0) {
                        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.time * 0.3 + wx + wy);
                        ctx.fillRect(wx, wy, 5, 5);
                    }
                }
            }
            ctx.globalAlpha = 1;

            // Empire State spire (building at x=50)
            if (b.x === 50) {
                ctx.fillStyle = '#888899';
                ctx.fillRect(b.x + b.w / 2 - 3, by - 35, 6, 35);
                ctx.fillRect(b.x + b.w / 2 - 1, by - 55, 2, 20);
                // Red blink
                ctx.fillStyle = `rgba(255,50,50,${0.5 + 0.5 * Math.sin(this.time * 2)})`;
                ctx.fillRect(b.x + b.w / 2 - 1, by - 58, 2, 3);
            }
            // Freedom Tower twin (x=150)
            if (b.x === 150) {
                ctx.fillStyle = '#444460';
                ctx.fillRect(b.x + b.w / 2 - 2, by - 30, 4, 30);
            }
        }

        // Statue of Liberty silhouette (far right)
        const slx = 750, sly = gY - 65;
        ctx.fillStyle = '#5a7a6a';
        // Base
        ctx.fillRect(slx, sly + 50, 20, 15);
        // Pedestal
        ctx.fillRect(slx + 2, sly + 40, 16, 12);
        // Body
        ctx.fillRect(slx + 4, sly + 15, 12, 26);
        // Head
        ctx.beginPath(); ctx.arc(slx + 10, sly + 12, 6, 0, Math.PI * 2); ctx.fill();
        // Crown spikes
        for (let i = -2; i <= 2; i++) {
            ctx.fillRect(slx + 10 + i * 2 - 1, sly + 3, 2, 6 - Math.abs(i));
        }
        // Torch arm
        ctx.fillRect(slx + 14, sly + 20, 8, 3);
        ctx.fillRect(slx + 21, sly + 14, 3, 8);
        // Torch flame
        ctx.fillStyle = `rgba(255,200,50,${0.7 + 0.3 * Math.sin(this.time * 4)})`;
        ctx.beginPath(); ctx.arc(slx + 22, sly + 12, 4, 0, Math.PI * 2); ctx.fill();

        // Central Park rectangle (green band low in sky)
        ctx.fillStyle = 'rgba(60,110,50,0.25)';
        ctx.fillRect(280, gY - 30, 120, 20);

        // Yellow taxi silhouettes on ground
        const taxiPositions = [120, 310, 520, 680];
        const scroll = this.groundOffset;
        for (const tx of taxiPositions) {
            const rx = ((tx - scroll * 0.5) % W + W) % W;
            ctx.fillStyle = '#f5c518';
            ctx.fillRect(~~rx, gY - 13, 28, 10);
            ctx.fillStyle = '#333';
            ctx.fillRect(~~rx + 4, gY - 17, 18, 6);
            ctx.fillStyle = '#88ccff';
            ctx.fillRect(~~rx + 5, gY - 16, 7, 4);
            ctx.fillRect(~~rx + 13, gY - 16, 7, 4);
        }
    }

    // 2) SpaceX Headquarters
    _drawSpaceX(ctx, W) {
        const gY = this.groundY;

        // Stars
        this._drawStars(ctx, W);

        // SpaceX main building: large industrial hangar
        // Hangar 1 (left)
        ctx.fillStyle = '#1a1a30';
        ctx.fillRect(30, gY - 120, 200, 120);
        // Hangar door detail
        ctx.fillStyle = '#252545';
        ctx.fillRect(80, gY - 110, 80, 110);
        ctx.strokeStyle = '#3a3a60'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(120, gY - 110); ctx.lineTo(120, gY); ctx.stroke();
        // SpaceX logo text area
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('SPACEX', 130, gY - 90);
        // Stripe
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(30, gY - 62, 200, 3);
        // US flag on pole
        const px = 220, py = gY - 140;
        ctx.fillStyle = '#aaa'; ctx.fillRect(px, py, 3, 80);
        ctx.fillStyle = '#cc0000';
        for (let r = 0; r < 4; r++) ctx.fillRect(px + 3, py + r * 5, 30, 3);
        ctx.fillStyle = '#fff';
        for (let r = 0; r < 3; r++) ctx.fillRect(px + 3, py + 3 + r * 5, 30, 2);
        ctx.fillStyle = '#002868';
        ctx.fillRect(px + 3, py, 13, 10);

        // Falcon 9 rocket on launchpad (center)
        const rx = 380, ry = gY - 160;
        // Launchpad
        ctx.fillStyle = '#333344'; ctx.fillRect(rx - 30, gY - 18, 60, 18);
        ctx.fillStyle = '#222233'; ctx.fillRect(rx - 8, gY - 35, 16, 20);
        // Rocket body
        ctx.fillStyle = '#e8e8f0'; ctx.fillRect(rx - 10, ry, 20, 130);
        // Interstage
        ctx.fillStyle = '#2a2a40'; ctx.fillRect(rx - 11, ry + 80, 22, 8);
        // Grid fins
        ctx.fillStyle = '#555570';
        ctx.fillRect(rx - 16, ry + 20, 6, 15);
        ctx.fillRect(rx + 10, ry + 20, 6, 15);
        // Fairing nose cone
        ctx.fillStyle = '#f0f0ff';
        ctx.beginPath();
        ctx.moveTo(rx - 10, ry);
        ctx.lineTo(rx, ry - 30);
        ctx.lineTo(rx + 10, ry); ctx.fill();
        // Engine glow
        const eg = 0.4 + 0.4 * Math.sin(this.time * 6);
        ctx.fillStyle = `rgba(255,150,50,${eg})`;
        ctx.beginPath(); ctx.arc(rx, gY - 36, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,80,20,${eg * 0.5})`;
        ctx.beginPath(); ctx.arc(rx, gY - 36, 14, 0, Math.PI * 2); ctx.fill();
        // SpaceX decal on rocket
        ctx.fillStyle = '#000010'; ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center'; ctx.fillText('SpaceX', rx, ry + 50);

        // Second hangar / warehouse (right side)
        ctx.fillStyle = '#15152a';
        ctx.fillRect(520, gY - 90, 250, 90);
        ctx.fillStyle = '#1e1e35';
        for (let i = 0; i < 5; i++) ctx.fillRect(530 + i * 46, gY - 80, 30, 80);
        // Sign
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('STARSHIP FACTORY', 645, gY - 50);
        ctx.font = '8px monospace'; ctx.fillStyle = '#aaaacc';
        ctx.fillText('HAWTHORNE, CA', 645, gY - 36);

        // Starship silhouette (far right)
        const ssx = 720, ssy = gY - 160;
        ctx.fillStyle = '#c0c0d0';
        ctx.fillRect(ssx, ssy, 22, 140);
        // Flaps
        ctx.fillStyle = '#a0a0b0';
        ctx.fillRect(ssx - 8, ssy + 10, 8, 20);
        ctx.fillRect(ssx + 22, ssy + 10, 8, 20);
        ctx.fillRect(ssx - 6, ssy + 100, 6, 15);
        ctx.fillRect(ssx + 22, ssy + 100, 6, 15);
        // Nose
        ctx.fillStyle = '#d0d0e0';
        ctx.beginPath();
        ctx.moveTo(ssx, ssy);
        ctx.lineTo(ssx + 11, ssy - 35);
        ctx.lineTo(ssx + 22, ssy); ctx.fill();

        ctx.textAlign = 'left';
    }

    // 3) White House
    _drawWhiteHouse(ctx, W) {
        const gY = this.groundY;

        // Beautiful blue sky already drawn; add subtle lawn
        ctx.fillStyle = 'rgba(60,130,50,0.2)';
        ctx.fillRect(0, gY - 25, W, 25);

        // Background tree line
        for (let tx = 0; tx < W; tx += 55) {
            const h = 50 + (tx % 30);
            ctx.fillStyle = '#3a7030';
            ctx.beginPath();
            ctx.arc(tx + 20, gY - h, 20 + (tx % 10), 0, Math.PI * 2); ctx.fill();
        }

        // North Portico – main building
        const bx = 180, bw = 440, bh = 110;
        const by = gY - bh;

        // Main body
        ctx.fillStyle = '#f5f5f0';
        ctx.fillRect(bx, by, bw, bh);

        // Columns (6 large + wings)
        const colW = 14, colH = 75, colY = by + 20;
        ctx.fillStyle = '#e8e8e0';
        const colPositions = [210, 255, 300, 345, 390, 435, 475, 520];
        for (const cx of colPositions) {
            ctx.fillRect(cx, colY, colW, colH);
            // Column cap
            ctx.fillStyle = '#d0d0c8';
            ctx.fillRect(cx - 2, colY, colW + 4, 6);
            ctx.fillRect(cx - 2, colY + colH - 6, colW + 4, 6);
            ctx.fillStyle = '#e8e8e0';
        }

        // Portico pediment (triangular roof)
        ctx.fillStyle = '#eeeeea';
        ctx.beginPath();
        ctx.moveTo(200, colY);
        ctx.lineTo(400, colY - 40);
        ctx.lineTo(590, colY); ctx.fill();
        ctx.strokeStyle = '#ccccc0'; ctx.lineWidth = 2;
        ctx.stroke();

        // Roof / balustrade
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx - 10, by, bw + 20, 18);
        ctx.fillStyle = '#e0e0da';
        for (let rx = bx; rx < bx + bw; rx += 12) {
            ctx.fillRect(rx, by + 4, 6, 14);
        }

        // Flag on top
        const fpx = 390, fpy = by - 55;
        ctx.fillStyle = '#aaaaaa'; ctx.fillRect(fpx, fpy, 3, 55);
        ctx.fillStyle = '#cc0000';
        for (let r = 0; r < 4; r++) ctx.fillRect(fpx + 3, fpy + r * 5, 28, 3);
        ctx.fillStyle = '#fff';
        for (let r = 0; r < 3; r++) ctx.fillRect(fpx + 3, fpy + 3 + r * 5, 28, 2);
        ctx.fillStyle = '#002868'; ctx.fillRect(fpx + 3, fpy, 12, 10);

        // West + East wings
        ctx.fillStyle = '#f0f0eb';
        ctx.fillRect(bx - 110, by + 30, 110, bh - 30);  // West wing
        ctx.fillRect(bx + bw, by + 30, 110, bh - 30);   // East wing
        // Wing windows
        ctx.fillStyle = '#88aacc';
        for (let wx = bx - 90; wx < bx - 20; wx += 22) ctx.fillRect(wx, by + 45, 14, 20);
        for (let wx = bx + bw + 15; wx < bx + bw + 90; wx += 22) ctx.fillRect(wx, by + 45, 14, 20);

        // Main facade windows (blue, arched tops)
        ctx.fillStyle = '#77aabb';
        const winY = by + 50;
        for (let wi = 0; wi < 5; wi++) {
            const wx = bx + 80 + wi * 65;
            ctx.fillRect(wx, winY, 20, 34);
            ctx.beginPath(); ctx.arc(wx + 10, winY, 10, Math.PI, 0); ctx.fill();
        }

        // Portico door
        ctx.fillStyle = '#224410';
        ctx.fillRect(375, colY + 30, 48, colH - 30);
        ctx.fillStyle = '#aacc88';
        ctx.fillRect(383, colY + 32, 15, 28);
        ctx.fillRect(402, colY + 32, 15, 28);

        // South fountain (two pixel circles)
        ctx.strokeStyle = 'rgba(100,180,255,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(390, gY - 10, 18, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(100,180,255,${0.2 + 0.1 * Math.sin(this.time * 3)})`;
        ctx.beginPath(); ctx.arc(390, gY - 10, 18, 0, Math.PI * 2); ctx.fill();
        // Fountain spray
        for (let a = 0; a < 6; a++) {
            const ax = 390 + Math.cos(a) * (6 + 3 * Math.sin(this.time * 2 + a));
            const ay = gY - 10 - (10 + 5 * Math.sin(this.time * 2 + a));
            ctx.fillStyle = 'rgba(150,210,255,0.5)';
            ctx.beginPath(); ctx.arc(ax, ay, 2, 0, Math.PI * 2); ctx.fill();
        }

        // "WHITE HOUSE" sign (subtle)
        ctx.fillStyle = 'rgba(50,80,50,0.7)'; ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('1600 Pennsylvania Ave', 400, gY - 5);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }

    // 4) Night city (stars + lit-up city silhouette)
    _drawNightCity(ctx, W) {
        const gY = this.groundY;

        // Dark building silhouettes with lit windows
        const bldgs = [
            { x: 0, w: 60, h: 110, c: '#0a0a18' },
            { x: 55, w: 45, h: 150, c: '#080810' },
            { x: 95, w: 70, h: 90, c: '#0d0d1e' },
            { x: 160, w: 50, h: 180, c: '#07070f' },
            { x: 205, w: 40, h: 120, c: '#0a0a18' },
            { x: 240, w: 80, h: 100, c: '#0e0e20' },
            { x: 315, w: 55, h: 170, c: '#08081a' },
            { x: 365, w: 45, h: 130, c: '#0c0c1c' },
            { x: 405, w: 65, h: 160, c: '#07070e' },
            { x: 465, w: 50, h: 90, c: '#0a0a18' },
            { x: 510, w: 70, h: 145, c: '#0b0b1a' },
            { x: 575, w: 40, h: 130, c: '#090910' },
            { x: 610, w: 80, h: 175, c: '#07070f' },
            { x: 685, w: 55, h: 110, c: '#0d0d1e' },
            { x: 735, w: 65, h: 140, c: '#0a0a18' },
        ];

        for (const b of bldgs) {
            const by = gY - b.h;
            ctx.fillStyle = b.c;
            ctx.fillRect(b.x, by, b.w, b.h);

            // Lit windows - warm yellow/white
            for (let wy = by + 8; wy < gY - 4; wy += 11) {
                for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 9) {
                    const lit = ((wx * 11 + wy * 7) & 7) > 2;
                    if (lit) {
                        const flicker = Math.sin(this.time * 0.5 + wx * 0.1 + wy * 0.07);
                        const warmth = flicker > 0.6 ? '#ffee99' : '#ffdd66';
                        ctx.fillStyle = warmth;
                        ctx.globalAlpha = 0.6 + 0.3 * Math.abs(flicker);
                        ctx.fillRect(wx, wy, 5, 5);
                        ctx.globalAlpha = 1;
                    }
                }
            }

            // Rooftop blinking lights (red)
            const blinkOn = Math.sin(this.time * 1.5 + b.x) > 0;
            if (blinkOn) {
                ctx.fillStyle = 'rgba(255,40,40,0.85)';
                ctx.fillRect(b.x + b.w / 2 - 1, by - 4, 2, 4);
            }
        }

        // Neon signs (horizontal strips)
        const neons = [
            { x: 100, y: gY - 40, w: 50, c: '#ff4488', label: 'BAR' },
            { x: 290, y: gY - 50, w: 70, c: '#44ffff', label: 'CRYPTO' },
            { x: 520, y: gY - 45, w: 60, c: '#ff8800', label: 'HODL' },
        ];
        for (const n of neons) {
            const glow = 0.6 + 0.4 * Math.sin(this.time * 3 + n.x);
            ctx.globalAlpha = glow;
            ctx.fillStyle = n.c;
            ctx.fillRect(n.x, n.y, n.w, 14);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(n.label, n.x + n.w / 2, n.y + 7);
            ctx.globalAlpha = 1;
        }
        ctx.textAlign = 'left';
    }

    // ── Special FX renderers ──────────────────────────────────────────────────
    _drawStars(ctx, W) {
        ctx.fillStyle = '#ffffff';
        // Deterministic stars from time
        const seed = 42;
        for (let i = 0; i < 40; i++) {
            const sx = ((seed * (i + 1) * 7919) % W);
            const sy = ((seed * (i + 1) * 104729) % this.groundY);
            const twinkle = Math.sin(this.time * 2 + i) * 0.4 + 0.6;
            ctx.globalAlpha = twinkle;
            ctx.fillRect(~~sx, ~~sy, 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    _drawMatrixRain(ctx, W) {
        const maxY = this.groundY * 0.6; // only draw in upper 60% of sky – gameplay zone stays clear
        ctx.fillStyle = '#00ff00';
        ctx.font = '10px monospace';
        const chars = '01アイウエオカキクケコ₿Ξ◎';
        for (let i = 0; i < 20; i++) {
            const cx = ((i * 7919 + 13) % W);
            const cy = ((this.time * 60 + i * 137) % (maxY + 40)) - 20;
            ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.time + i);
            ctx.fillText(chars[(~~(this.time * 3 + i)) % chars.length], cx, cy);
        }
        ctx.globalAlpha = 1;
    }

    _drawSnow(ctx, W) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 30; i++) {
            const sx = ((i * 7919 + ~~(this.time * 20)) % W);
            const sy = ((this.time * 30 + i * 97) % this.groundY);
            const size = 1 + (i % 3);
            ctx.globalAlpha = 0.5 + 0.3 * Math.sin(i);
            ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    _drawBubbles(ctx, W) {
        ctx.strokeStyle = 'rgba(100,200,255,0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 15; i++) {
            const bx = ((i * 7919 + 31) % W);
            const by = this.groundY - ((this.time * 20 + i * 73) % this.groundY);
            const r = 3 + (i % 5);
            ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.stroke();
        }
    }

    _drawNeonLines(ctx, W) {
        const colors = ['#ff00ff', '#00ffff', '#ffff00'];
        for (let i = 0; i < 5; i++) {
            const ny = 20 + ((i * 97 + ~~(this.time * 10)) % (this.groundY - 40));
            ctx.strokeStyle = colors[i % 3];
            ctx.globalAlpha = 0.15 + 0.1 * Math.sin(this.time * 2 + i);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, ny); ctx.lineTo(W, ny); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // ── Tropical Beach ────────────────────────────────────────────────────────
    _drawBeach(ctx, W) {
        const gY = this.groundY;

        // Sun
        const sunX = W * 0.75, sunY = 45;
        ctx.save();
        ctx.shadowColor = '#ffee44'; ctx.shadowBlur = 30;
        ctx.fillStyle = '#ffe066';
        ctx.beginPath(); ctx.arc(sunX, sunY, 28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff8cc';
        ctx.beginPath(); ctx.arc(sunX, sunY, 20, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.restore();

        // Ocean wave strip
        ctx.fillStyle = 'rgba(0,150,255,0.18)';
        ctx.fillRect(0, gY - 22, W, 22);
        for (let wx = 0; wx < W; wx += 80) {
            const ox = ((wx - this.groundOffset * 0.5) % W + W) % W;
            ctx.fillStyle = 'rgba(120,210,255,0.35)';
            ctx.beginPath();
            ctx.arc(ox, gY - 8, 18 + 4 * Math.sin(this.time * 2 + wx), 0, Math.PI * 2);
            ctx.fill();
        }

        // Palm trees (left & right)
        const drawPalm = (px) => {
            const py = gY;
            ctx.fillStyle = '#7a5c2a';
            ctx.fillRect(px, py - 80, 6, 80);
            // Leaves
            ctx.fillStyle = '#2d8a30';
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2 + this.time * 0.3;
                const lx = px + 3 + Math.cos(angle) * 28;
                const ly = py - 78 + Math.sin(angle) * 14;
                ctx.fillStyle = `hsl(${110 + i * 8},60%,35%)`;
                ctx.beginPath(); ctx.ellipse(lx, ly, 16, 5, angle, 0, Math.PI * 2); ctx.fill();
            }
            // Coconuts
            ctx.fillStyle = '#5a3a10';
            ctx.beginPath(); ctx.arc(px + 6, py - 60, 5, 0, Math.PI * 2); ctx.fill();
        };
        drawPalm(50); drawPalm(W - 70);

        // Seagulls
        for (let i = 0; i < 4; i++) {
            const bx = ((i * 197 + this.time * 18) % (W + 40)) - 20;
            const by = 30 + i * 18 + Math.sin(this.time * 1.5 + i) * 6;
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(bx - 8, by);
            ctx.quadraticCurveTo(bx - 4, by - 4, bx, by);
            ctx.quadraticCurveTo(bx + 4, by - 4, bx + 8, by);
            ctx.stroke();
        }
    }

    // ── Electric Storm ────────────────────────────────────────────────────────
    _drawStorm(ctx, W) {
        const gY = this.groundY;

        // Dark storm clouds
        ctx.fillStyle = 'rgba(40,40,80,0.6)';
        const cloudData = [
            { x: 0, y: 10, w: 200, h: 50 },
            { x: 150, y: 5, w: 240, h: 60 },
            { x: 380, y: 15, w: 180, h: 45 },
            { x: 520, y: 0, w: 260, h: 65 },
        ];
        for (const c of cloudData) {
            ctx.fillStyle = `rgba(30,30,70,0.55)`;
            ctx.beginPath(); ctx.ellipse(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2, 0, 0, Math.PI * 2); ctx.fill();
        }

        // Rain streaks
        ctx.strokeStyle = 'rgba(180,180,255,0.4)'; ctx.lineWidth = 1;
        for (let i = 0; i < 35; i++) {
            const rx = ((i * 7919 + ~~(this.time * 90)) % (W + 40)) - 20;
            const ry = ((this.time * 180 + i * 137) % (gY + 20)) - 20;
            ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + 4, ry + 16); ctx.stroke();
        }

        // Lightning bolts (random, brief)
        const boltA = Math.sin(this.time * 7.3 + 1) > 0.94;
        const boltB = Math.sin(this.time * 5.1 + 3) > 0.96;
        if (boltA) {
            const bx = 180 + Math.sin(this.time * 3) * 80;
            ctx.save();
            ctx.strokeStyle = '#ccccff'; ctx.lineWidth = 2.5;
            ctx.shadowColor = '#8888ff'; ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(bx, 10); ctx.lineTo(bx - 8, 55); ctx.lineTo(bx + 6, 60);
            ctx.lineTo(bx - 10, gY - 20); ctx.stroke();
            ctx.restore();
        }
        if (boltB) {
            const bx = 560 + Math.cos(this.time * 2) * 60;
            ctx.save();
            ctx.strokeStyle = '#ddddff'; ctx.lineWidth = 2;
            ctx.shadowColor = '#aaaaff'; ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.moveTo(bx, 5); ctx.lineTo(bx + 10, 40); ctx.lineTo(bx - 4, 48);
            ctx.lineTo(bx + 8, gY - 20); ctx.stroke();
            ctx.restore();
        }

        // Ground electric glow
        ctx.save();
        ctx.globalAlpha = 0.15 + 0.1 * Math.sin(this.time * 8);
        ctx.fillStyle = '#8888ff';
        ctx.fillRect(0, gY - 3, W, 4);
        ctx.restore();
    }

    // ─── Input ────────────────────────────────────────────────────────────────
    _setupInput() {
        window.addEventListener('keydown', (e) => {
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

            const wasDown = this.keys[e.code];
            this.keys[e.code] = true;

            if ((e.code === 'Space' || e.code === 'ArrowUp') && this.state === 'MENU') { this.audio.playMenuSelect(); this.restart(); }
            if ((e.code === 'Space' || e.code === 'ArrowUp') && this.state === 'RUNNING' && !wasDown) {
                const wasGrounded = this.player.grounded;
                this.player.jump();
                if (wasGrounded) this.audio.playJump(); else this.audio.playDoubleJump();
            }
            if ((e.code === 'KeyP' || e.code === 'Escape') && (this.state === 'RUNNING' || this.state === 'PAUSED')) this.togglePause();
            if (e.code === 'ArrowDown' && this.state === 'RUNNING') this.player.duck();
            if ((e.code === 'Space' || e.code === 'ArrowUp') && this.state === 'RANKING') { this.audio.playMenuSelect(); this.restart(); }
            e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            if (e.code === 'ArrowDown' && this.state === 'RUNNING') this.player._unduck();
        });
    }

    _setupTouch() {
        let touchStartY = 0;
        let touchStartX = 0;
        let isDucking = false;

        this.canvas.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;

            if (this.state === 'MENU') { this.restart(); e.preventDefault(); return; }
            if (this.state === 'GAMEOVER' || this.state === 'RANKING') { this._handleCanvasClick(e.touches[0]); e.preventDefault(); return; }

            if (this.state === 'RUNNING') {
                // Check on-screen button zones
                const zones = this.ui.getMobileHitZones(this.W, this.H);
                const rect = this.canvas.getBoundingClientRect();
                const sx = this.canvas.clientWidth / this.W;
                const sy = this.canvas.clientHeight / this.H;
                const cx = (e.touches[0].clientX - rect.left) / sx;
                const cy = (e.touches[0].clientY - rect.top) / sy;

                const inZone = (z) => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
                if (inZone(zones.jump)) { const wg = this.player.grounded; this.player.jump(); if (wg) this.audio.playJump(); else this.audio.playDoubleJump(); }
                else if (inZone(zones.duck)) { this.player.duck(); isDucking = true; }
                else { const wg = this.player.grounded; this.player.jump(); if (wg) this.audio.playJump(); else this.audio.playDoubleJump(); }
            }
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (this.state !== 'RUNNING') { e.preventDefault(); return; }
            const dy = e.touches[0].clientY - touchStartY;
            if (dy > 28 && !isDucking) { this.player.duck(); isDucking = true; }
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (this.state === 'RUNNING') { this.player._unduck(); isDucking = false; }
            e.preventDefault();
        }, { passive: false });

        // Mouse click on canvas
        this.canvas.addEventListener('click', (e) => {
            if (this.state === 'MENU') { this._handleMenuClick(e); return; }
            if (this.state === 'GAMEOVER' || this.state === 'RANKING') this._handleCanvasClick(e);
        });
    }

    _handleCanvasClick(ev) {
        const action = this.ui.hitTestGameOver(ev.clientX, ev.clientY);
        if (action === 'home') { window.location.href = 'https://punchinthetrenches.fun'; return; }
        if (action === 'restart') { this.restart(); return; }
        if (action === 'share') { this._shareOnX(); return; }
        if (action === 'copy') { this._copyScore(); return; }
        if (action === 'card') { this._showShareCard(); return; }
        if (action === 'ranking') { this.state = 'RANKING'; return; }
        if (action === 'tab_local') { this.ui._lbTab = 'local'; return; }
        if (action === 'tab_global') {
            this.ui._lbTab = 'global';
            if (!this.ui._globalEntries && !this.ui._globalLoading) {
                this.ui._globalLoading = true;
                this.storage.fetchGlobalLeaderboard().then(entries => {
                    this.ui._globalEntries = entries;
                    this.ui._globalLoading = false;
                });
            }
            return;
        }
    }

    _handleMenuClick(ev) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleY = this.canvas.clientHeight / this.H;
        const cy = (ev.clientY - rect.top) / scaleY;
        // Wallet button zone: y = H-30, h=20
        if (cy >= this.H - 30 && cy <= this.H - 10) {
            this.ui.showPopup('🔒 Wallet Connect – Coming Soon!', '#ffd700');
        }
    }

    _showShareCard() {
        const d = this._gameOverData;
        if (!d) return;
        showShareCard(this, {
            score: d.score,
            survivalTime: d.time,
            plushCount: d.plush,
            bestStreak: d.streak,
            biomeName: this._getBiome().name,
        });
    }

    _shareOnX() {
        const d = this._gameOverData;
        const puLabel = d.powerup ? { bull: '🐂 Bull Market', pump: '💊 PUMP x3', bear: '🐻 Bear Mode', airdrop: '🪂 Airdrop', shield: '🪖 Shield', magnet: '🧲 Magnet', slowtime: '⏰ Slow Time' }[d.powerup] || '' : '';
        const biome = d.biome || '';
        const extras = [puLabel, biome].filter(Boolean).join(' · ');
        const text = encodeURIComponent(
            `⚔️ My Trench Wallet – PUNCH IN THE TRENCHES\n\n💰 $${Math.floor(d.score)} | ⏱ ${Math.floor(d.time)}s | 🔥 x${d.streak}${extras ? '\n' + extras : ''}\n\n₿×${d.btc || 0}  ◆×${d.eth || 0}  Ⓢ×${d.sol || 0}\n\nSurvive the trenches 👇\n${this.gameUrl}\n\n#PunchInTheTrenches #crypto #Solana`
        );
        window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
    }

    _copyScore() {
        const d = this._gameOverData;
        const text = `⚔️ Punch in the Trenches | $${Math.floor(d.score)} | BTC×${d.btc || 0}=$${d.btcVal || 0} | ETH×${d.eth || 0}=$${d.ethVal || 0} | SOL×${d.sol || 0}=$${d.solVal || 0} | ${this.gameUrl} #PunchInTheTrenches`;
        navigator.clipboard?.writeText(text);
        this.ui.showPopup('📋 Copied!', '#8b9a6b');
    }

    _setupResize() {
        const fit = () => {
            const ratio = this.W / this.H;
            const vw = window.innerWidth, vh = window.innerHeight;
            if (vw / vh > ratio) {
                this.canvas.style.width = `${vh * ratio}px`;
                this.canvas.style.height = `${vh}px`;
            } else {
                this.canvas.style.width = `${vw}px`;
                this.canvas.style.height = `${vw / ratio}px`;
            }
        };
        window.addEventListener('resize', fit);
        fit();
    }
}
