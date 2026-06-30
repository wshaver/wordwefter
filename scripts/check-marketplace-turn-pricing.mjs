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

function createMarketplaceGame() {
  const game = new WordWefterGameState({
    playerNames: ["Ada", "Ben"],
    gameLength: "short"
  });

  game.players[0].score = 30;
  game.players[1].score = 30;
  game.lettersAvailable = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 1,
    F: 1,
    G: 1,
    H: 1
  };
  game.tilesDrawn = 4;
  game.marketplaceTiles = [
    { id: "market-a", letter: "A", points: 1 },
    { id: "market-b", letter: "B", points: 3 },
    { id: "market-c", letter: "C", points: 3 },
    { id: "market-d", letter: "D", points: 2 }
  ];

  return game;
}

function marketplaceLetters(game) {
  return game.marketplaceTiles
    .filter(Boolean)
    .map((tile) => tile.letter);
}

const game = createMarketplaceGame();
const originalRandom = Math.random;

try {
  Math.random = () => 0;

  assert.deepEqual(
    game.getMarketplaceTileCosts(),
    [1, 2, 3, 4],
    "marketplace prices should be assigned left to right at turn start"
  );
  assert.equal(game.getMarketplaceTileCost("market-c"), 3, "middle tile should cost its current slot price");

  const boughtMiddleTile = game.buyMarketplaceTile("market-c");

  assert.equal(boughtMiddleTile.marketplaceCost, 3, "purchased tile should record its fixed turn price");
  assert.equal(game.currentScore, 27, "purchase should subtract the slot price");
  assert.deepEqual(
    game.marketplaceTiles.map((tile) => tile?.letter || null),
    ["A", "B", null, "D"],
    "buying a tile should leave the marketplace layout fixed during the turn"
  );
  assert.deepEqual(
    game.getMarketplaceTileCosts(),
    [1, 2, null, 4],
    "remaining marketplace tile prices should not change midturn"
  );

  game.returnPendingMarketplaceTile(boughtMiddleTile);
  assert.equal(game.currentScore, 30, "returning a pending purchase should restore score");
  assert.deepEqual(
    game.marketplaceTiles.map((tile) => tile?.letter || null),
    ["A", "B", "C", "D"],
    "returning a pending purchase should restore its original slot"
  );

  const boughtLeftTile = game.buyMarketplaceTile("market-a");
  assert.equal(boughtLeftTile.marketplaceCost, 1, "leftmost tile should cost one");
  game.currentRack.push(boughtLeftTile);
  assert.deepEqual(
    game.marketplaceTiles.map((tile) => tile?.letter || null),
    [null, "B", "C", "D"],
    "buying the leftmost tile should not slide remaining tiles during the turn"
  );

  game.commitMarketplacePurchases();
  assert.deepEqual(
    game.marketplaceTiles.map((tile) => tile?.letter || null),
    [null, "B", "C", "D"],
    "committing purchases should not refill or slide the marketplace before turn end"
  );

  game.advanceMarketplaceTurn(4);
  assert.deepEqual(
    marketplaceLetters(game),
    ["C", "D", "E", "F"],
    "turn-end marketplace advance should return the leftmost remaining tile to the pool, slide, and refill right without immediately redrawing it"
  );
  assert.equal(
    game.lettersAvailable.B,
    1,
    "the turn-expired marketplace tile should return to the pool"
  );
  assert.equal(
    game.tilesDrawn,
    5,
    "returning the expired marketplace tile should restore pool accounting before refilling"
  );
  assert.deepEqual(
    game.getMarketplaceTileCosts(),
    [1, 2, 3, 4],
    "marketplace prices should be reassigned for the next turn after sliding"
  );
  assert.deepEqual(
    game.discardedTiles.map((tile) => tile.letter),
    [],
    "the turn-expired marketplace tile should not be discarded"
  );
} finally {
  Math.random = originalRandom;
}

console.log("Marketplace turn-pricing checks passed.");
