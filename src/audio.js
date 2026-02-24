// src/audio.js – Web Audio API sound engine for Punch in the Trenches
// Procedural chiptune music + SFX. No external files needed.

const STORAGE_KEY = 'punch_audio_v1';

export class AudioManager {
    constructor() {
        this._ctx = null;
        this._masterGain = null;
        this._musicGain = null;
        this._sfxGain = null;
        this._seqTimer = null;
        this._musicRunning = false;
        this._s = this._load();    // settings
    }

    // ── Persistence ────────────────────────────────────────────────────────────
    _load() {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                musicVol: s.musicVol ?? 0.35,
                sfxVol: s.sfxVol ?? 0.55,
                muted: s.muted ?? false,
            };
        } catch { return { musicVol: 0.35, sfxVol: 0.55, muted: false }; }
    }

    _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._s)); } catch { }
    }

    // ── Context init (lazy, needs user gesture) ────────────────────────────────
    _init() {
        if (this._ctx) {
            if (this._ctx.state === 'suspended') this._ctx.resume();
            return;
        }
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();

        this._masterGain = this._ctx.createGain();
        this._masterGain.gain.value = this._s.muted ? 0 : 1;
        this._masterGain.connect(this._ctx.destination);

        this._musicGain = this._ctx.createGain();
        this._musicGain.gain.value = this._s.musicVol;
        this._musicGain.connect(this._masterGain);

        this._sfxGain = this._ctx.createGain();
        this._sfxGain.gain.value = this._s.sfxVol;
        this._sfxGain.connect(this._masterGain);
    }

    // ── Public settings ────────────────────────────────────────────────────────
    getMusicVol() { return this._s.musicVol; }
    getSfxVol() { return this._s.sfxVol; }
    isMuted() { return this._s.muted; }

    setMusicVol(v) {
        this._s.musicVol = v;
        if (this._musicGain) this._musicGain.gain.value = v;
        this._save();
    }

    setSfxVol(v) {
        this._s.sfxVol = v;
        if (this._sfxGain) this._sfxGain.gain.value = v;
        this._save();
    }

    setMuted(m) {
        this._s.muted = m;
        if (this._masterGain) this._masterGain.gain.value = m ? 0 : 1;
        this._save();
    }

    // ── Low-level tone helper ─────────────────────────────────────────────────
    _tone(freq, dur, type, gainVal, dest, t, attack = 0.005, release = 0.85) {
        if (!this._ctx) return;
        const osc = this._ctx.createOscillator();
        const g = this._ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(gainVal, t + attack);
        g.gain.setValueAtTime(gainVal, t + dur * release);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }

    // ── Sound Effects ─────────────────────────────────────────────────────────

    playJump() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(700, t + 0.13);
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(g); g.connect(this._sfxGain);
        osc.start(t); osc.stop(t + 0.2);
    }

    playDoubleJump() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        // Two rapid chirps
        [[300, 0], [500, 0.09]].forEach(([f, dt]) => {
            this._tone(f, 0.08, 'square', 0.22, this._sfxGain, t + dt);
        });
    }

    playCoin() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        // Rising triad blip: root → 3rd → 5th
        [[880, 0], [1108, 0.07], [1320, 0.14]].forEach(([f, dt]) => {
            this._tone(f, 0.09, 'square', 0.22, this._sfxGain, t + dt, 0.003);
        });
    }

    playPowerup() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        // Ascending 4-note fanfare
        [523, 659, 784, 1047].forEach((f, i) => {
            this._tone(f, 0.14, 'square', 0.28, this._sfxGain, t + i * 0.09);
        });
    }

    playAirdrop() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        // Triumphant 6-note jingle + vibrato tail
        [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27], [1319, 0.36], [1047, 0.48]].forEach(([f, dt]) => {
            this._tone(f, 0.12, 'square', 0.30, this._sfxGain, t + dt, 0.005);
        });
    }

    playStreak() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        // Quick ascending sparkle
        [659, 784, 988, 1319].forEach((f, i) => {
            this._tone(f, 0.10, 'square', 0.20, this._sfxGain, t + i * 0.055, 0.003);
        });
    }

    playShieldHit() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(150, t + 0.15);
        g.gain.setValueAtTime(0.30, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(g); g.connect(this._sfxGain);
        osc.start(t); osc.stop(t + 0.2);
    }

    playDeath() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(55, t + 0.55);
        g.gain.setValueAtTime(0.38, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(g); g.connect(this._sfxGain);
        osc.start(t); osc.stop(t + 0.65);
    }

    playGameOver() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        // Sad descending phrase
        [784, 659, 523, 392, 330].forEach((f, i) => {
            this._tone(f, 0.20, 'square', 0.28, this._sfxGain, t + i * 0.19, 0.005);
        });
        // Also a low rumble
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 60;
        g.gain.setValueAtTime(0.12, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        osc.connect(g); g.connect(this._sfxGain);
        osc.start(t + 0.1); osc.stop(t + 1.25);
    }

    playMenuSelect() {
        this._init();
        const ctx = this._ctx, t = ctx.currentTime;
        this._tone(880, 0.07, 'square', 0.20, this._sfxGain, t, 0.003);
        this._tone(1760, 0.07, 'square', 0.15, this._sfxGain, t + 0.07, 0.003);
    }

    // ── Background Music ──────────────────────────────────────────────────────
    // Procedural chiptune using timed Web Audio API scheduling.
    // The melody is scheduled in chunks; a timeout re-schedules the next chunk.

    startMusic() {
        this._init();
        if (this._musicRunning) return;
        this._musicRunning = true;
        this._seqLoop(0);
    }

    stopMusic() {
        this._musicRunning = false;
        if (this._seqTimer !== null) { clearTimeout(this._seqTimer); this._seqTimer = null; }
        // Fade out
        if (this._musicGain) {
            const ctx = this._ctx;
            const cur = this._musicGain.gain.value;
            this._musicGain.gain.setValueAtTime(cur, ctx.currentTime);
            this._musicGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            setTimeout(() => {
                if (!this._musicRunning && this._musicGain)
                    this._musicGain.gain.value = this._s.musicVol;
            }, 450);
        }
    }

    pauseMusic() { if (this._ctx) this._ctx.suspend(); }
    resumeMusic() { if (this._ctx) this._ctx.resume(); }

    _seqLoop(phase) {
        if (!this._musicRunning) return;
        const ctx = this._ctx;
        const BPM = 138;
        const B = 60 / BPM;   // 1 beat
        const E = B / 2;      // eighth note
        const Q = B;          // quarter
        const H = B * 2;      // half
        const S = B / 4;      // sixteenth

        // ── Note frequency map ──
        const _ = 0;
        const C3 = 130.81, G3 = 196.00, A3 = 220.00, F3 = 174.61;
        const C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392.00, A4 = 440.00, B4 = 493.88;
        const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880.00, B5 = 987.77;
        const C6 = 1046.50;

        // ── Two melody themes that alternate ──
        const THEME_A_LEAD = [
            // Main motif (Zelda-ish adventure)
            [E5, E], [_, S], [E5, S], [_, E], [E5, E], [_, E], [C5, E], [E5, Q],
            [G5, Q], [_, Q], [G4, Q], [_, Q],
            [C5, Q], [_, Q], [G4, Q], [_, Q],
            [E4, Q], [_, Q], [A4, Q], [B4, Q],
            // Resolution
            [A4, E], [_, S], [A4, S], [G4, E], [E5, E], [G5, Q],
            [A5, E], [F5, E], [G5, E], [_, E], [E5, Q], [C5, E], [D5, E], [B4, Q], [_, Q],
        ];

        const THEME_B_LEAD = [
            // Bridge / B section
            [G5, E], [F5, E], [E5, Q], [C5, E], [E5, E],
            [G5, Q], [A5, E], [G5, E], [E5, Q],
            [D5, E], [E5, E], [F5, Q], [E5, E], [D5, E],
            [C5, Q], [_, E], [E5, E], [G5, E], [A5, E],
            [G5, E], [A5, E], [G5, Q], [E5, Q],
            [D5, Q], [C5, E], [D5, E], [E5, H],
        ];

        const BASS = [
            [C3, Q], [C3, Q], [G3, Q], [G3, Q],
            [A3, Q], [A3, Q], [F3, Q], [F3, Q],
            [C3, Q], [C3, Q], [G3, Q], [G3, Q],
            [A3, Q], [F3, Q], [G3, Q], [_, Q],
        ];

        // Pick theme based on phase
        const LEAD = (phase % 2 === 0) ? THEME_A_LEAD : THEME_B_LEAD;
        const totalDur = LEAD.reduce((s, [, d]) => s + d, 0);
        const bassDur = BASS.reduce((s, [, d]) => s + d, 0);

        const now = ctx.currentTime + 0.05;

        // ── Schedule lead voice ──
        let t = now;
        for (const [freq, dur] of LEAD) {
            if (freq > 0) {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'square';
                osc.frequency.value = freq;
                // Subtle vibrato via frequency LFO
                const lfo = ctx.createOscillator();
                const lfoGain = ctx.createGain();
                lfo.frequency.value = 5.5;
                lfoGain.gain.value = 3;
                lfo.connect(lfoGain);
                lfoGain.connect(osc.frequency);
                lfo.start(t);
                lfo.stop(t + dur + 0.01);
                // Envelope
                g.gain.setValueAtTime(0.001, t);
                g.gain.linearRampToValueAtTime(0.18, t + 0.008);
                g.gain.setValueAtTime(0.18, t + dur * 0.75);
                g.gain.exponentialRampToValueAtTime(0.001, t + dur);
                osc.connect(g); g.connect(this._musicGain);
                osc.start(t); osc.stop(t + dur + 0.02);
            }
            t += dur;
        }

        // ── Schedule bass voice (loops to fill lead duration) ──
        t = now;
        const bassLoops = Math.ceil(totalDur / bassDur);
        outer: for (let loop = 0; loop < bassLoops; loop++) {
            for (const [freq, dur] of BASS) {
                if (t >= now + totalDur) break outer;
                if (freq > 0) {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.type = 'square';
                    osc.frequency.value = freq;
                    g.gain.setValueAtTime(0.001, t);
                    g.gain.linearRampToValueAtTime(0.10, t + 0.01);
                    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.85);
                    osc.connect(g); g.connect(this._musicGain);
                    osc.start(t); osc.stop(t + dur);
                }
                t += dur;
            }
        }

        // ── Schedule next loop ──
        this._seqTimer = setTimeout(() => {
            this._seqLoop(phase + 1);
        }, (totalDur - 0.12) * 1000);
    }
}
