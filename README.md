# Punch Run 🐒

Infinite web3 crypto runner. Jump over Red Candles, dodge FUD Clouds, collect Plushies, trigger combos, activate Diamond Hands shield, and flex your score on X!

## Quick Start (no install)

```bash
# Option A – Python
python -m http.server 8080
# Then open http://localhost:8080

# Option B – Node
npx serve .
# Then open the URL shown

# Option C – VS Code
# Install "Live Server" extension → right-click index.html → Open with Live Server
```

> ⚠️ Must be served over HTTP (not file://) because ES Modules require a server.

## Configure Game URL (for share tweet)

Open `src/main.js` and change line 3:

```js
const GAME_URL = 'https://yoursite.com'; // ← put your URL here
```

## Embed Mode

Append `?mode=embed` to the URL to hide leaderboard and share buttons during gameplay:

```
http://localhost:8080/?mode=embed
```

## Optional Server Leaderboard

See [`server/README.md`](server/README.md).

## Replacing Placeholder Art

All placeholder drawing is in clearly marked files:

| File | What to replace |
|------|-----------------|
| `src/player.js` → `drawRun()` / `drawDuck()` | Punch sprite sheet |
| `src/spawnDirector.js` → `draw()` | Obstacle + plush sprites |
| `src/game.js` → `_drawBuildings()` | Background tiles |

Search for `// TODO:` comments for exact hook points.

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Jump   | Space / ↑ | Tap  |
| Duck   | ↓       | Swipe down |

## Scoring

- +1 pt/second survived
- Common Plush: +10, Golden: +50, Meme: +100
- Combo Boost (every 5 plushies in a row): ×2 for 3s
- Weekend Event (Sat/Sun): ×2 plush points
- Stacks: `base × weekend × combo`

## Power-Ups

| Icon | Name          | Effect          |
|------|---------------|-----------------|
| 💎   | Diamond Hands | Absorb 1 hit    |
| 🧲   | Magnet        | Attract plushies 5s |
| ⏰   | Slow Time     | −35% speed for 3s |

## File Structure

```
/
├── index.html
├── styles.css
├── src/
│   ├── main.js          ← entry, GAME_URL config
│   ├── game.js          ← engine, loop, state machine
│   ├── player.js        ← Punch physics + drawing
│   ├── spawnDirector.js ← obstacle / plush / power-up pools
│   ├── powerups.js      ← Shield / Magnet / SlowTime
│   ├── ui.js            ← HUD, overlays, popups
│   └── storage.js       ← localStorage leaderboard
└── server/              ← optional server leaderboard
    ├── index.js
    └── README.md
```
