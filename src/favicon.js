// src/favicon.js – animated dancing Punch favicon
// Cycles through dance pose frames on a 32×32 canvas and swaps the <link rel="icon">

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
const FPS = 8;   // favicon doesn't need 60fps, 8 is smooth enough

export function startFaviconDance() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Get or create the <link rel="icon"> element
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }

    const img = new Image();
    img.src = 'assets/monkey_sprites.png';

    let frameIdx = 0;
    let last = 0;
    const interval = 1000 / FPS;

    img.onload = () => {
        // Background-remove pass (same green-screen technique as player.js)
        const offscreen = document.createElement('canvas');
        offscreen.width = img.width;
        offscreen.height = img.height;
        const oc = offscreen.getContext('2d');
        oc.drawImage(img, 0, 0);
        const id = oc.getImageData(0, 0, img.width, img.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            if (g > 130 && g > r * 1.3 && g > b * 1.3) d[i + 3] = 0; // green → transparent
        }
        oc.putImageData(id, 0, 0);

        const step = (ts) => {
            if (ts - last >= interval) {
                last = ts;
                const sp = S[DANCE_FRAMES[frameIdx]];
                ctx.clearRect(0, 0, 32, 32);
                // Draw sprite scaled to 32×32, centered
                const scale = Math.min(32 / sp.w, 32 / sp.h);
                const dw = sp.w * scale, dh = sp.h * scale;
                const dx = (32 - dw) / 2, dy = (32 - dh) / 2;
                ctx.drawImage(offscreen, sp.x, sp.y, sp.w, sp.h, dx, dy, dw, dh);
                link.href = canvas.toDataURL('image/png');
                frameIdx = (frameIdx + 1) % DANCE_FRAMES.length;
            }
            requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
    };
}
