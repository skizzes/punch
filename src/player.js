// src/player.js – Uses exact sprite bounding boxes from the user's sprite sheet
// Sprite sheet: 1024×904, non-uniform grid
// Background removed at runtime by color-keying top-left pixel

const GRAVITY = 1500;
const JUMP_VEL = -640;
const AIR_JUMPS = 1; // one double-jump allowed

// Display size on canvas
const DRAW_W = 56;
const DRAW_H = 48;
const DUCK_W = 56;
const DUCK_H = 36;

// ── Exact sprite source rectangles {x, y, w, h} ────────────────────────────
// Row 1 (y:52-165): 5 sprites – walk/run cycle
const S = [
    { x: 28, y: 52, w: 140, h: 114 },  // 0  run frame 1
    { x: 199, y: 52, w: 141, h: 114 },  // 1  run frame 2
    { x: 369, y: 52, w: 140, h: 114 },  // 2  run frame 3
    { x: 545, y: 52, w: 141, h: 114 },  // 3  run frame 4
    { x: 740, y: 52, w: 140, h: 114 },  // 4  run frame 5
    // Row 2 (y:223-335): 6 sprites
    { x: 28, y: 223, w: 138, h: 113 }, // 5  pose 1
    { x: 192, y: 223, w: 125, h: 113 }, // 6  pose 2
    { x: 355, y: 223, w: 125, h: 113 }, // 7  pose 3
    { x: 523, y: 223, w: 129, h: 113 }, // 8  pose 4
    { x: 689, y: 223, w: 125, h: 113 }, // 9  pose 5
    { x: 880, y: 223, w: 120, h: 113 }, // 10 pose 6 (arms up/small)
];

// Run animation: use row 1 frames (indices 0-4)
const RUN_FRAMES = [0, 1, 2, 3, 4];
// Jump: arms-open pose
const JUMP_IDX = 7;
// Duck: uses row 2 poses
const DUCK_FRAMES = [5, 6, 8, 9];

// ─── Sprite sheet loader with background removal ───────────────────────────
let processedSheet = null;

function loadAndProcessSheet() {
    const raw = new Image();
    raw.crossOrigin = 'anonymous';
    raw.onload = () => {
        const c = document.createElement('canvas');
        c.width = raw.width;
        c.height = raw.height;
        const cx = c.getContext('2d');
        cx.drawImage(raw, 0, 0);

        const imgData = cx.getImageData(0, 0, c.width, c.height);
        const d = imgData.data;

        // Sample top-left pixel as background reference
        const bgR = d[0], bgG = d[1], bgB = d[2];
        const THR = 35;

        for (let i = 0; i < d.length; i += 4) {
            const dr = Math.abs(d[i] - bgR);
            const dg = Math.abs(d[i + 1] - bgG);
            const db = Math.abs(d[i + 2] - bgB);
            if (dr < THR && dg < THR && db < THR) {
                d[i + 3] = 0; // transparent
            }
        }

        cx.putImageData(imgData, 0, 0);
        processedSheet = c;
    };
    raw.src = 'assets/monkey_sprites.png';
}

loadAndProcessSheet();

// ─── Player class ──────────────────────────────────────────────────────────
export class Player {
    constructor(x, groundY) {
        this.startX = x;
        this.groundY = groundY;
        this.reset();
    }

    reset() {
        this.x = this.startX;
        this.w = DRAW_W;
        this.h = DRAW_H;
        this.y = this.groundY - DRAW_H;
        this.vy = 0;
        this.grounded = true;
        this.ducking = false;
        this.runFrame = 0;
        this.runTimer = 0;
        this.airJumps = 0;      // double-jump counter
        // death flash
        this.deathFlash = false;
        this.deathFlashTimer = 0;
    }

    jump() {
        if (this.grounded) {
            this.vy = JUMP_VEL;
            this.grounded = false;
            this.airJumps = 0;
            if (this.ducking) this._unduck();
        } else if (this.airJumps < AIR_JUMPS) {
            // Double jump – slightly weaker
            this.vy = JUMP_VEL * 0.82;
            this.airJumps++;
        }
    }

    duck() {
        if (this.grounded && !this.ducking) {
            this.ducking = true;
            this.w = DUCK_W;
            this.h = DUCK_H;
            this.y = this.groundY - DUCK_H;
        }
    }

    _unduck() {
        if (!this.ducking) return;
        this.ducking = false;
        this.w = DRAW_W;
        this.h = DRAW_H;
        if (this.grounded) this.y = this.groundY - DRAW_H;
    }

    /** Called by game.js when the player hits an obstacle (for death animation) */
    triggerDeathFlash() {
        this.deathFlash = true;
        this.deathFlashTimer = 0.35; // seconds
    }

    update(dt, keys) {
        if ((keys['Space'] || keys['ArrowUp']) && !this.ducking) {
            // Only consume key once per press - game.js handles this via _jumpPressed flag
        }
        if (keys['ArrowDown'] && this.grounded) this.duck();
        else if (!keys['ArrowDown'] && this.ducking) this._unduck();

        if (!this.grounded) {
            this.vy += GRAVITY * dt;
            this.y += this.vy * dt;
            const land = this.groundY - this.h;
            if (this.y >= land) {
                this.y = land;
                this.vy = 0;
                this.grounded = true;
                this.airJumps = 0;
            }
        }

        if (this.grounded) {
            this.runTimer += dt;
            if (this.runTimer > 0.10) {
                this.runTimer = 0;
                this.runFrame = (this.runFrame + 1) % RUN_FRAMES.length;
            }
        }

        // Death flash timer
        if (this.deathFlashTimer > 0) {
            this.deathFlashTimer -= dt;
            if (this.deathFlashTimer <= 0) this.deathFlash = false;
        }
    }

    getHitbox() {
        const s = 8;
        return { x: this.x + s, y: this.y + s, w: this.w - s * 2, h: this.h - s * 2 };
    }

    _drawSprite(ctx, spriteIdx, dx, dy, dw, dh, flip = false) {
        if (!processedSheet) return;
        const s = S[spriteIdx];
        if (flip) {
            ctx.save();
            ctx.translate(dx + dw, dy);
            ctx.scale(-1, 1);
            ctx.drawImage(processedSheet, s.x, s.y, s.w, s.h, 0, 0, dw, dh);
            ctx.restore();
        } else {
            ctx.drawImage(processedSheet, s.x, s.y, s.w, s.h, dx, dy, dw, dh);
        }
    }

    draw(ctx, shieldActive, magnetActive) {
        const x = ~~this.x;
        const y = ~~this.y;

        // Death flash: overlay red tint
        if (this.deathFlash) {
            const alpha = 0.5 + 0.5 * Math.sin(this.deathFlashTimer * 40);
            ctx.save();
            ctx.globalAlpha = alpha;
        }

        // Draw sprite
        let idx;
        if (this.ducking) {
            idx = DUCK_FRAMES[this.runFrame % DUCK_FRAMES.length];
            this._drawSprite(ctx, idx, x, y, this.w, this.h);
        } else if (!this.grounded) {
            idx = JUMP_IDX;
            this._drawSprite(ctx, idx, x, y, this.w, this.h);
        } else {
            idx = RUN_FRAMES[this.runFrame];
            this._drawSprite(ctx, idx, x, y, this.w, this.h);
        }

        if (this.deathFlash) {
            // Red flash layer on top of sprite
            ctx.fillStyle = `rgba(255,50,50,${0.45 + 0.45 * Math.sin(this.deathFlashTimer * 40)})`;
            ctx.fillRect(x, y, this.w, this.h);
            ctx.restore();
        }

        // Helmet IN FRONT of sprite (drawn after)
        if (shieldActive) {
            const hcx = x + this.w * 0.55;
            ctx.save();
            ctx.fillStyle = '#4a5d23';
            ctx.beginPath();
            ctx.ellipse(hcx, y + 3, 18, 12, 0, Math.PI, 0);
            ctx.rect(hcx - 18, y + 3, 36, 6);
            ctx.fill();
            ctx.fillStyle = '#3b4a1f';
            ctx.fillRect(hcx - 20, y + 7, 40, 3);
            ctx.fillStyle = '#6b8e23';
            ctx.fillRect(hcx - 3, y - 8, 6, 4);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(hcx - 2, y - 1, 4, 4);
            ctx.restore();
        }

        if (magnetActive) {
            ctx.save();
            ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
            ctx.beginPath();
            ctx.arc(x + this.w / 2, y + this.h / 2, 120, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]); ctx.restore();
        }
    }
}
