// src/powerups.js – Shield, Magnet, Slow Time, Pump.fun Pill, Bull/Bear Market, Airdrop
export const PU = {
    SHIELD: 'shield',
    MAGNET: 'magnet',
    SLOWTIME: 'slowtime',
    PUMP: 'pump',
    BULL: 'bull',      // Bull Market – coin rain 5s
    BEAR: 'bear',      // Bear Market – slow speed, score x2 for 5s
    AIRDROP: 'airdrop',   // Instant +500 pts + coin burst
};

const MAGNET_DURATION = 5;
const MAGNET_RADIUS = 220;
const MAGNET_PULL = 420;
const SLOWTIME_DURATION = 3;
const SLOWTIME_MULT = 0.65;
const SLOWTIME_RETURN = 1.2;
const PUMP_DURATION = 6;
const PUMP_MULTIPLIER = 3;
const BULL_DURATION = 5;
const BEAR_DURATION = 5;
const BEAR_SPEED_MULT = 0.70;
const BEAR_SCORE_MULT = 2;

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
        this.bearActive = false;
        this.bearTimer = 0;
    }

    activate(type) {
        const ui = this.engine.ui;
        const tier = this.engine.wallet?.getTier();

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
            const bonus = tier?.bullBonus ?? 0;
            this.bullActive = true;
            this.bullTimer = BULL_DURATION + bonus;
            if (ui) ui.showPopup(bonus > 0
                ? `🐂 BULL MARKET! +${bonus}s WHALE BONUS!`
                : '🐂 BULL MARKET! COIN RAIN!', '#F7931A');

        } else if (type === PU.BEAR) {
            this.bearActive = true;
            this.bearTimer = BEAR_DURATION;
            if (ui) ui.showPopup('🐻 BEAR MARKET! x2 SCORE!', '#60a5fa');

        } else if (type === PU.AIRDROP) {
            // Instant bonus — points applied in game.js via _collectPU
            if (ui) ui.showPopup('🪂 AIRDROP! +500 PTS!', '#ffd700');
        }
    }

    breakShield() {
        this.shieldActive = false;
        if (this.engine.ui) this.engine.ui.showPopup('💔 SHIELD BROKEN!', '#535353');
    }

    /** Combined speed multiplier */
    getSpeedMultiplier() {
        let m = 1.0;
        if (this.slowActive) m *= SLOWTIME_MULT;
        if (this.slowReturn) {
            const t = 1 - (this.slowReturnTimer / SLOWTIME_RETURN);
            m *= SLOWTIME_MULT + t * (1 - SLOWTIME_MULT);
        }
        if (this.bearActive) m *= BEAR_SPEED_MULT;
        return m;
    }

    /** Score multiplier (pump + bear stack) */
    getScoreMultiplier() {
        let m = 1;
        if (this.pumpActive) m *= PUMP_MULTIPLIER;
        if (this.bearActive) m *= BEAR_SCORE_MULT;
        return m;
    }

    /** Effective magnet radius (whale tier doubles it) */
    getMagnetRadius() {
        const tier = this.engine.wallet?.getTier();
        return tier?.magnetBonus ? MAGNET_RADIUS * 2 : MAGNET_RADIUS;
    }

    update(dt, player, activePlushies) {
        // Magnet
        if (this.magnetActive) {
            this.magnetTimer -= dt;
            if (this.magnetTimer <= 0) {
                this.magnetActive = false;
            } else {
                const r = this.getMagnetRadius();
                const cx = player.x + player.w / 2;
                const cy = player.y + player.h / 2;
                for (const pl of activePlushies) {
                    const dx = cx - (pl.x + pl.w / 2);
                    const dy = cy - (pl.y + pl.h / 2);
                    const d = Math.hypot(dx, dy);
                    if (d < r && d > 1) {
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

        // Bear market
        if (this.bearActive) {
            this.bearTimer -= dt;
            if (this.bearTimer <= 0) {
                this.bearActive = false;
                if (this.engine.ui) this.engine.ui.showPopup('🐂 BEAR GONE – BULL RETURNS!', '#22c55e');
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
            items.push({ icon: '🐂', label: `BULL ${this.bullTimer.toFixed(1)}s`, timer: this.bullTimer / BULL_DURATION });
        if (this.bearActive)
            items.push({ icon: '🐻', label: `x2 ${this.bearTimer.toFixed(1)}s`, timer: this.bearTimer / BEAR_DURATION });
        return items;
    }
}
