// src/powerups.js – Shield, Magnet, Slow Time, Pump.fun Pill
export const PU = {
    SHIELD: 'shield',
    MAGNET: 'magnet',
    SLOWTIME: 'slowtime',
    PUMP: 'pump',
    BULL: 'bull',      // Bull Market – coin rain for 5s
};

const MAGNET_DURATION = 5;
const MAGNET_RADIUS = 220;
const MAGNET_PULL = 420;
const SLOWTIME_DURATION = 3;
const SLOWTIME_MULT = 0.65;
const SLOWTIME_RETURN = 1.2;
const PUMP_DURATION = 6;      // seconds the pill lasts
const PUMP_MULTIPLIER = 3;      // score x3 while active

export class PowerupManager {
    constructor(engine) {
        this.engine = engine;
        this.reset();
    }

    reset() {
        this.shieldActive = false;
        this.magnetActive = false;
        this.magnetTimer = 0;
        this.slowActive = false;
        this.slowTimer = 0;
        this.slowReturn = false;
        this.slowReturnTimer = 0;
        this.pumpActive = false;
        this.pumpTimer = 0;
        this.bullActive = false;
        this.bullTimer = 0;
    }

    activate(type) {
        const ui = this.engine.ui;
        if (type === PU.SHIELD) {
            this.shieldActive = true;
            if (ui) ui.showPopup('🪖 HELMETED UP!', '#535353');
        } else if (type === PU.MAGNET) {
            this.magnetActive = true;
            this.magnetTimer = MAGNET_DURATION;
            if (ui) ui.showPopup('🧲 MAGNET!', '#535353');
        } else if (type === PU.SLOWTIME) {
            this.slowActive = true;
            this.slowTimer = SLOWTIME_DURATION;
            this.slowReturn = false;
            if (ui) ui.showPopup('⏰ SLOW TIME!', '#535353');
        } else if (type === PU.PUMP) {
            this.pumpActive = true;
            this.pumpTimer = PUMP_DURATION;
            if (ui) ui.showPopup('💊 LFG! x3 SCORE!', '#535353');
        } else if (type === PU.BULL) {
            this.bullActive = true;
            this.bullTimer = 5;
            if (ui) ui.showPopup('🐂 BULL MARKET! COIN RAIN!', '#F7931A');
        }
    }

    breakShield() {
        this.shieldActive = false;
        if (this.engine.ui) this.engine.ui.showPopup('💔 SHIELD BROKEN!', '#535353');
    }

    /** Overall speed multiplier (slow-time affects this) */
    getSpeedMultiplier() {
        if (this.slowActive) return SLOWTIME_MULT;
        if (this.slowReturn) {
            const t = 1 - (this.slowReturnTimer / SLOWTIME_RETURN);
            return SLOWTIME_MULT + t * (1 - SLOWTIME_MULT);
        }
        return 1.0;
    }

    /** Score multiplier (pump pill affects this) */
    getScoreMultiplier() {
        return this.pumpActive ? PUMP_MULTIPLIER : 1;
    }

    update(dt, player, activePlushies) {
        // Magnet
        if (this.magnetActive) {
            this.magnetTimer -= dt;
            if (this.magnetTimer <= 0) {
                this.magnetActive = false;
            } else {
                const cx = player.x + player.w / 2;
                const cy = player.y + player.h / 2;
                for (const pl of activePlushies) {
                    const dx = cx - (pl.x + pl.w / 2);
                    const dy = cy - (pl.y + pl.h / 2);
                    const d = Math.hypot(dx, dy);
                    if (d < MAGNET_RADIUS && d > 1) {
                        pl.x += (dx / d) * MAGNET_PULL * dt;
                        pl.y += (dy / d) * MAGNET_PULL * dt;
                    }
                }
            }
        }

        // Slow time
        if (this.slowActive) {
            this.slowTimer -= dt;
            if (this.slowTimer <= 0) {
                this.slowActive = false;
                this.slowReturn = true;
                this.slowReturnTimer = SLOWTIME_RETURN;
            }
        }
        if (this.slowReturn) {
            this.slowReturnTimer -= dt;
            if (this.slowReturnTimer <= 0) this.slowReturn = false;
        }

        // Pump pill
        if (this.pumpActive) {
            this.pumpTimer -= dt;
            if (this.pumpTimer <= 0) {
                this.pumpActive = false;
                if (this.engine.ui) this.engine.ui.showPopup('💊 PUMP ENDED', '#535353');
            }
        }
        // Bull market
        if (this.bullActive) {
            this.bullTimer -= dt;
            if (this.bullTimer <= 0) {
                this.bullActive = false;
                if (this.engine.ui) this.engine.ui.showPopup('🐹 BEAR IS BACK...', '#ef4444');
            }
        }
    }

    getHUDData() {
        const items = [];
        if (this.shieldActive)
            items.push({ icon: '🪖', label: 'SHIELD', timer: null });
        if (this.magnetActive)
            items.push({ icon: '🧲', label: `${this.magnetTimer.toFixed(1)}s`, timer: this.magnetTimer / MAGNET_DURATION });
        if (this.slowActive)
            items.push({ icon: '⏰', label: `${this.slowTimer.toFixed(1)}s`, timer: this.slowTimer / SLOWTIME_DURATION });
        if (this.pumpActive)
            items.push({ icon: '💊', label: `x3 ${this.pumpTimer.toFixed(1)}s`, timer: this.pumpTimer / PUMP_DURATION });
        if (this.bullActive)
            items.push({ icon: '🐂', label: `BULL ${this.bullTimer.toFixed(1)}s`, timer: this.bullTimer / 5 });
        return items;
    }
}
