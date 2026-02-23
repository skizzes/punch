# Punch Run – Server Leaderboard

Optional server-side leaderboard using Node.js + Express.

## Setup

```bash
cd server
npm init -y
npm install express cors
node index.js
```

Server runs on **http://localhost:3001** by default.

## Endpoints

| Method | Path               | Body                                    | Description        |
|--------|--------------------|-----------------------------------------|--------------------|
| GET    | `/api/leaderboard` | —                                       | Returns top 10     |
| POST   | `/api/score`       | `{name, score, time, plush, streak}`    | Submit a new score |

## Persistence

Scores are stored in `server/scores.json`. Delete the file to reset.

## Connecting the game

In `src/storage.js`, after `saveScore()`, add:

```js
fetch('http://localhost:3001/api/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, score, time, plush, streak }),
});
```
