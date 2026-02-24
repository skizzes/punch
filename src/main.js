// src/main.js – Entry point
const GAME_URL = window.PUNCH_GAME_URL || 'https://play.punchinthetrenches.fun';

import { GameEngine } from './game.js';
import { startFaviconDance } from './favicon.js';

const params = new URLSearchParams(window.location.search);
const embedMode = params.get('mode') === 'embed';

window.addEventListener('DOMContentLoaded', () => {
    startFaviconDance();
    const engine = new GameEngine({ embedMode, gameUrl: GAME_URL });
    engine.start();

    // ── Audio panel controls ─────────────────────────────────────────────────
    const audioBtn = document.getElementById('audio-btn');
    const audioPanel = document.getElementById('audio-panel');
    const musicSlider = document.getElementById('music-vol');
    const sfxSlider = document.getElementById('sfx-vol');
    const musicVal = document.getElementById('music-vol-val');
    const sfxVal = document.getElementById('sfx-vol-val');
    const muteBtn = document.getElementById('mute-btn');

    // Sync sliders from saved settings
    const sync = () => {
        const a = engine.audio;
        const mv = Math.round(a.getMusicVol() * 100);
        const sv = Math.round(a.getSfxVol() * 100);
        musicSlider.value = mv;
        sfxSlider.value = sv;
        musicVal.textContent = `${mv}%`;
        sfxVal.textContent = `${sv}%`;
        const muted = a.isMuted();
        muteBtn.textContent = muted ? '🔊 UNMUTE' : '🔇 MUTE ALL';
        muteBtn.classList.toggle('active', muted);
        audioBtn.classList.toggle('muted', muted);
        audioBtn.textContent = muted ? '🔕' : '🎵';
    };
    sync();

    // Toggle panel
    audioBtn.addEventListener('click', () => {
        const open = !audioPanel.classList.contains('hidden');
        audioPanel.classList.toggle('hidden', open);
        if (!open) sync(); // refresh when opening
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!audioPanel.contains(e.target) && e.target !== audioBtn) {
            audioPanel.classList.add('hidden');
        }
    });

    musicSlider.addEventListener('input', () => {
        const v = musicSlider.value / 100;
        engine.audio.setMusicVol(v);
        musicVal.textContent = `${musicSlider.value}%`;
    });

    sfxSlider.addEventListener('input', () => {
        const v = sfxSlider.value / 100;
        engine.audio.setSfxVol(v);
        sfxVal.textContent = `${sfxSlider.value}%`;
    });

    muteBtn.addEventListener('click', () => {
        engine.audio.setMuted(!engine.audio.isMuted());
        sync();
    });
});

