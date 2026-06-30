const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const gameJs = fs.readFileSync(path.join(root, "src", "game.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const oauthButtonsIndex = indexHtml.indexOf('class="oauth-buttons"');
const publicLeaderboardButtonIndex = indexHtml.indexOf('id="show-public-leaderboard-button"');
const identityBarIndex = indexHtml.indexOf('id="identity-bar"');

assert(publicLeaderboardButtonIndex !== -1, "Missing public leaderboard button.");
assert(
  oauthButtonsIndex !== -1 &&
    publicLeaderboardButtonIndex > oauthButtonsIndex &&
    publicLeaderboardButtonIndex < identityBarIndex,
  "Public leaderboard button must sit below OAuth buttons in the signed-out identity panel."
);
assert(
  /const showPublicLeaderboardButton = document\.querySelector\("#show-public-leaderboard-button"\);/.test(gameJs),
  "Public leaderboard button is not bound in game.js."
);
assert(
  /showPublicLeaderboardButton\.addEventListener\("click",\s*\(\) => \{\s*void showLeaderboard\(\);\s*\}\);/s.test(gameJs),
  "Public leaderboard button should open the standard leaderboard route."
);
assert(
  /window\.addEventListener\("hashchange",\s*async \(\) => \{\s*if \(!window\.location\.hash\) \{\s*setGameMessage\(""\);[\s\S]*?setScreen\("welcome"\);[\s\S]*?return;\s*\}/.test(gameJs),
  "Browser Back from the public leaderboard should return signed-out users to the welcome demo."
);
assert(
  /function renderWelcomeDemoGame\(\)/.test(gameJs),
  "Missing signed-out demo renderer."
);
assert(
  /renderWelcomeDemoGame\(\);/.test(gameJs),
  "Signed-out initialization should render the example board demo."
);
assert(
  !/showWelcomeLeaderboardPreview\(\);/.test(gameJs),
  "Signed-out initialization should not default to the leaderboard preview."
);
assert(
  /^\.leaderboard-page\s*\{[^}]*width:\s*var\(--play-width\);[^}]*max-width:\s*var\(--play-width\);/ms.test(stylesCss),
  "Leaderboard pages should use the logged-in play width in every access state."
);
assert(
  /body\.screen-leaderboard:not\(\.has-player\) \.identity-panel\s*\{[^}]*display:\s*grid;/s.test(stylesCss),
  "Signed-out leaderboard route should show login controls."
);
assert(
  /body\.screen-leaderboard:not\(\.has-player\) \.masthead,\s*body\.screen-play:not\(\.has-player\) \.masthead\s*\{[^}]*width:\s*var\(--play-width\);/s.test(stylesCss),
  "Signed-out leaderboard route should use the logged-in header width."
);
assert(
  /body\.screen-leaderboard \.public-leaderboard-button\s*\{[^}]*display:\s*none;/s.test(stylesCss),
  "Leaderboard route should hide the public leaderboard button."
);
assert(
  /\.identity-menu > \.game-button\s*\{[^}]*justify-content:\s*flex-start;/s.test(stylesCss) &&
    /\.identity-menu > \.game-button:not\(\.identity-menu-checkbox\):not\(\.create-game-button-with-icon\):not\(\.game-list-button-with-icon\):not\(\.leaderboard-button-with-icon\):not\(\.rules-button-with-icon\):not\(\.changelog-button-with-icon\):not\(\.logout-button-with-icon\)::before\s*\{[^}]*width:\s*1\.15rem;/s.test(stylesCss),
  "Identity menu rows should be left-aligned with placeholder icon spacing for rows without icons."
);
assert(
  /\.menu-waiting-games\s*\{[^}]*gap:\s*0\.75rem;/s.test(stylesCss) &&
    /\.menu-waiting-game\s*\{[^}]*min-height:\s*3\.15rem;[^}]*padding:\s*0\.7rem 1\.1rem;/s.test(stylesCss) &&
    /\.identity-menu \.menu-waiting-game\s*\{[^}]*min-height:\s*3\.15rem;/s.test(stylesCss),
  "Waiting-game menu buttons should match the height and spacing of the main menu buttons."
);
assert(
  /function getVisibleWaitingGamesForMenu\(\)\s*\{[\s\S]*?document\.body\.classList\.contains\("screen-play"\)[\s\S]*?waitingGamesForMenu\.filter\(\(game\) => String\(game\?\.id \|\| ""\)\.trim\(\)\.toUpperCase\(\) !== currentGameId\);[\s\S]*?\}/.test(gameJs) &&
    /const visibleWaitingGames = getVisibleWaitingGamesForMenu\(\);\s*const count = visibleWaitingGames\.length;/.test(gameJs) &&
    /visibleWaitingGames\.forEach\(\(game\) => \{/.test(gameJs),
  "Waiting-game menu badge should ignore the game currently open on the play screen."
);

console.log("Public leaderboard entry checks passed.");
