import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const gameJs = fs.readFileSync(path.join(root, "src", "game.js"), "utf8");

globalThis.document = {
  readyState: "loading",
  addEventListener() {}
};
globalThis.window = {
  addEventListener() {},
  location: {
    hash: "",
    hostname: "wordwefter",
    protocol: "http:"
  }
};

const { WordWefterGameState } = await import("../src/game-state.js");

const game = new WordWefterGameState({
  playerNames: ["Ada", "Ben", "Cal"],
  gameLength: "short"
});

assert.equal(
  game.hasPlayerCompletedTurn(0),
  false,
  "a player should not have completed a turn at game start"
);
assert.equal(
  game.shouldShowMarketplaceOpeningSoon(0),
  true,
  "a player's marketplace should show Opening Soon before their first completed turn"
);

game.history.push({
  turnIndex: 0,
  playerName: "Ada",
  action: "pass",
  words: []
});

assert.equal(
  game.hasPlayerCompletedTurn(0),
  true,
  "a pass should count as the player's first completed turn"
);
assert.equal(
  game.shouldShowMarketplaceOpeningSoon(0),
  false,
  "a player's marketplace should show letters after their first completed turn"
);
assert.equal(
  game.shouldShowMarketplaceOpeningSoon(1),
  true,
  "other players should still see Opening Soon before their own first turn is completed"
);

game.marketplaceClosed = true;
assert.equal(
  game.shouldShowMarketplaceOpeningSoon(1),
  false,
  "the closed marketplace sign should take precedence once the marketplace is closed"
);

const waitingForOpenSpotGame = new WordWefterGameState({
  playerNames: ["Sue", "Open Spot 2"],
  gameLength: "short"
});
waitingForOpenSpotGame.currentPlayerIndex = 1;
waitingForOpenSpotGame.players[1].claimed = false;
waitingForOpenSpotGame.players[1].open = true;
waitingForOpenSpotGame.history.push({
  turnIndex: 0,
  playerName: "Sue",
  words: [
    {
      word: "DIE",
      score: 5
    }
  ]
});
assert.equal(
  waitingForOpenSpotGame.shouldShowMarketplaceOpeningSoon(0),
  false,
  "a player waiting for an open spot to move should see the marketplace after their own first turn"
);
assert.equal(
  waitingForOpenSpotGame.shouldShowMarketplaceOpeningSoon(),
  true,
  "the active open spot may still be opening soon, but it should not control the logged-in player's marketplace display"
);

assert.match(
  gameJs,
  /function getLoggedInPlayerIndex\(\)\s*\{[\s\S]*?findIndex[\s\S]*?\}/,
  "the renderer should be able to resolve the logged-in player's index"
);
assert.match(
  gameJs,
  /function shouldRenderMarketplaceOpeningSoon\(\)\s*\{[\s\S]*?screen-play[\s\S]*?getLoggedInPlayerIndex\(\)[\s\S]*?gameState\.shouldShowMarketplaceOpeningSoon\(loggedInPlayerIndex\)[\s\S]*?\}/,
  "the Opening Soon sign should only render on the play screen for the logged-in player's first-turn state"
);
assert.match(
  gameJs,
  /document\.body\.classList\.toggle\("marketplace-opening-soon",\s*shouldRenderMarketplaceOpeningSoon\(\)\)/,
  "the body Opening Soon class should not be toggled on the signed-out welcome page"
);

console.log("Marketplace Opening Soon checks passed.");
