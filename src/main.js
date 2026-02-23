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
});
