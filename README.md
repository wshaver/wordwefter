# WordWefter

WordWefter is a browser-based word tile placement game inspired by Scrabble-style word building, with its own rules around stacking tiles, marketplace purchases, rainbow tiles, wild tiles, and variable game lengths.

Play it here: [https://www.willshaver.com/wordwefter](https://www.willshaver.com/wordwefter)

## About the Game

Players take turns placing letter tiles onto a shared board to form valid words. Later turns can build on existing words, stack tiles on occupied squares, buy tiles from a shared marketplace, and use special tile effects to change scoring.

Highlights:

- 9x9 word tile board
- Multiplayer turn-based game state
- Shared marketplace for buying extra tiles with points
- Stackable tiles with increasing score multipliers
- Wild tiles that resolve into letters when played
- Rainbow tiles that double changed words containing them
- Short, medium, and long game length options
- Published in-game rules page

## Built With

This is a JavaScript-based web game built with HTML, CSS, JavaScript, jQuery, lodash, SortableJS, and a small PHP save/load backend.

## Development Note

This entire project is vibe-coded with Codex, under my oversight. The code, gameplay rules, UI behavior, and iteration have been shaped through hands-on review, testing, and direction while using Codex as the primary implementation partner.

## Running Locally

The app is intended to run from a web server because it uses browser modules and a PHP backend for saved games. Put the project behind a local PHP-capable server and open the app root in a browser.

The main app files live in `public/`.

## Status

WordWefter is playable and actively evolving.
