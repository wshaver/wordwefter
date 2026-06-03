This project is available on the local Apache server at http://wordwefter/.
Use that URL for in-app browser verification instead of starting an ad hoc local server.

We're making a javascript-based word tile placement game similar to scrabble.

Use jquery and lodash methods as appropriate.

Review notes for future Codex runs:

- The New Game route is `http://wordwefter/#newgame`. `#new` is not a valid route and can leave only the header visible.
- The app may reuse already-loaded ES modules when only the hash changes. After editing `public/game.js`, force a full page reload with a temporary page query string such as `http://wordwefter/?refresh=<reason>#newgame`, and update the `game.js` query token in `public/index.html` when users need browsers to pick up the new module reliably.
- The player setup rows are rendered both as static HTML in `public/index.html` and dynamically by `createPlayerNameRow()` / `renderPlayerNameInputs()` in `public/game.js`. Review both paths when changing the setup form.
- Browser verification should use the in-app browser against the Apache URL above. If coordinate clicks are needed, first inspect a viewport screenshot; the Browser `cua.click` helper expects viewport `{ x, y }` coordinates. Do not use coordinates taken from a full-page screenshot; scroll the target into view first, take a viewport screenshot, then click.
- In-app browser page-scope inspection can report normal globals such as `window.$`, `window._`, `fetch`, or `performance` as unavailable even when the app is visibly initialized. Prefer direct UI interaction plus DOM/class sampling for behavior verification, and use `tab.dev.logs()` for console errors.
- Rack and marketplace tile entry animation is intentionally shared: new tile IDs entering either area should use the shuffle-style variants, start from the right, and be paced by the shared queue in `animateSequentialTileEnter()`. Keep the `game.js` query token in `public/index.html` bumped after animation changes.
- Ignore Git entirely in this project. Do not run git status, git diff, git config, or other Git commands; the user manages Git separately. Work directly on the code and verify behavior.
