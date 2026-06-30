import assert from "node:assert/strict";

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

console.log("Marketplace Opening Soon checks passed.");
