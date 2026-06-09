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
- In-app browser text entry can fail with virtual clipboard errors when using Playwright `fill()` / `type()` or CUA typing. If setup-form text changes are not the thing under test, prefer using an already-valid saved game, a URL route, or a purpose-built test hook instead of spending time fighting text input. If text entry itself must be tested, verify with visible UI state and document the browser limitation in the final note.
- The setup form includes a locked current-player row and may also have static/dynamic copies of player-name inputs. Broad selectors such as `.player-name-input` or label lookups can hit readonly or hidden controls. Scope setup checks to `#player-name-list`, prefer concrete IDs such as `#player-name-input-2`, and account for locked rows before trying to edit fields.
- App test hooks live on `window.wordWefterTest` in `public/game.js`, with serializable readiness/config markers mirrored onto `document.documentElement.dataset` for in-app browser checks. When tests need additional game internals, add them to `wordWefterTest` or the dataset markers as appropriate instead of relying on ad hoc page-scope globals.
- Browser verification can create or mutate saved games under `public/saved-games`. Use clearly disposable games when possible, and mention any game IDs created or modified in the final response so the user can clean them up if desired.
- CSS `calc()` division may not apply in the in-app browser. When matching responsive tile/grid dimensions, prefer using the same CSS grid/aspect-ratio structure as the source component and verify with viewport `getBoundingClientRect()` measurements instead of depending on divided CSS math.
- Saved game JSON does not persist transient tile IDs; `loadFromJSON()` rehydrates new IDs. Rack/marketplace animation checks should compare stable tile signatures/counts such as letter, wild, rainbow, and source letter rather than IDs, otherwise unchanged server refreshes can replay enter animations for every tile.
- Distinguish active-player rules from logged-in-player display. Marketplace purchase actions and affordability checks are for the active player, but passive UI shown to any viewer, such as marketplace cost, should use the logged-in player when available.
- Rack and marketplace tile entry animation is intentionally shared: new tile IDs entering either area should use the shuffle-style variants, start from the right, and be paced by the shared queue in `animateSequentialTileEnter()`. Keep the `game.js` query token in `public/index.html` bumped after animation changes.
- After each browser/testing round, update this `AGENTS.md` file when a new repeatable workaround, failure mode, route detail, cache behavior, or verification shortcut is learned. Keep additions concise and focused on preventing future agents from repeating unproductive paths.
- Ignore Git entirely in this project. Do not run git status, git diff, git config, or other Git commands; the user manages Git separately. Work directly on the code and verify behavior.
