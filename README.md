# WordWefter

WordWefter is a browser-based word tile placement game inspired by Scrabble-style word building, with its own rules around stacking tiles, marketplace purchases, rainbow tiles, wild tiles, and variable game lengths.

Play it here: [https://wordwefter.com](https://wordwefter.com)

## About the Game

Players take turns placing letter tiles onto a shared board to form valid words. Later turns can build on existing words, stack tiles on occupied squares, buy tiles from a shared marketplace, and use special tile effects to change scoring.

Highlights:

- 9x9 word tile board
- Multiplayer turn-based game state
- Invite links for claiming open player spots
- Shared marketplace for buying extra tiles with points
- Stackable tiles with increasing score multipliers
- Wild tiles that resolve into letters when played
- Rainbow tiles that double changed words containing them
- Short, medium, and long game length options
- Final-round handling when the pool and marketplace run dry
- Published in-game rules page

## Hosting and Sign-In

`https://wordwefter.com` is the primary hosted game. New games should be created there.

Production sign-in is OAuth-based when provider configuration is present. Local development at `http://wordwefter/` can use the simple username prompt.

## Recent Gameplay Rules

The marketplace is a shared tile row that players can buy from using finalized points. Wild tiles never stay in the marketplace: if a wild would be drawn there, it returns to the pool and another tile is drawn.

When a player tries to draw and the tile pool is empty, the marketplace closes. Its remaining tiles are returned to the pool, a tilted `CLOSED` sign appears, and the draw is attempted again from those returned tiles.

If a player tries to draw and both the pool and marketplace are empty, the final round begins. Each active player gets one more turn, including the player who drew the last tile. The active player sees a Last Turn notice above their rack during that turn.

Invite links are shown while a game has open player spots. When a friend claims a spot, the server preserves that claimed player record even if another player submits a turn from stale browser state.

## Built With

This is a JavaScript-based web game built with HTML, CSS, JavaScript, jQuery, lodash, SortableJS, and a small PHP save/load backend.

## Development Note

This entire project is vibe-coded with Codex, under my oversight. The code, gameplay rules, UI behavior, and iteration have been shaped through hands-on review, testing, and direction while using Codex as the primary implementation partner.

## Running Locally

The app is intended to run from a web server because it uses browser modules and a PHP backend for saved games. Put the project behind a local PHP-capable server and open the app root in a browser.

In this workspace the local Apache URL is usually `http://wordwefter/`.

The app is served from `public/`. Source JavaScript lives in `src/` and is bundled into `public/dist/` for the browser.

## Build and Deploy

Install dependencies once with:

```powershell
npm.cmd install
```

Create the production bundle with:

```powershell
npm.cmd run build:prod
```

This writes the deployable JavaScript bundle to `public/dist/`. The production build does not include browser test hooks.

For local verification, create the test bundle with:

```powershell
npm.cmd run build:test
```

This writes to `public/dist-test/` and includes the test hook entry used by automated checks. Do not ship `public/dist-test/` to production.

Run the full project check with:

```powershell
npm.cmd run check
```

`npm.cmd run check` builds both variants and runs the JavaScript regression checks for build separation, changelog content, letter points, board bonuses, marketplace flow, auth redirects, and leaderboard behavior.

Deployments should use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
```

The deploy script runs the production build, uploads files from `public/`, and excludes `dist-test` so test-only code is not deployed.

## Status

WordWefter is playable and actively evolving.
