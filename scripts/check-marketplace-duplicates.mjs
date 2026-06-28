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

const { WordWefterGameState } = await import("../public/game.js");

function createMarketplaceGame(lettersAvailable, marketplaceTiles) {
  const game = new WordWefterGameState({
    playerNames: ["Ada"],
    gameLength: "short"
  });

  game.startingLettersAvailable = { ...lettersAvailable };
  game.lettersAvailable = { ...lettersAvailable };
  game.marketplaceTiles = marketplaceTiles;
  game.tilesDrawn = 0;
  return game;
}

function getMarketplaceLetters(game) {
  return game.marketplaceTiles
    .filter(Boolean)
    .map((tile) => tile.letter);
}

const originalRandom = Math.random;

try {
  Math.random = () => 0;

  const gameWithAlternative = createMarketplaceGame(
    { A: 3, B: 1 },
    [{ id: "market-a", letter: "A", points: 1 }]
  );

  gameWithAlternative.drawMarketplaceTiles(2);
  assert.deepEqual(
    getMarketplaceLetters(gameWithAlternative),
    ["A", "B"],
    "marketplace should draw a non-duplicate letter when one is available"
  );

  const gameWithoutAlternative = createMarketplaceGame(
    { A: 2 },
    [{ id: "market-a", letter: "A", points: 1 }]
  );

  gameWithoutAlternative.drawMarketplaceTiles(2);
  assert.deepEqual(
    getMarketplaceLetters(gameWithoutAlternative),
    ["A", "A"],
    "marketplace should allow duplicates when no other letters are available"
  );
} finally {
  Math.random = originalRandom;
}

console.log("Marketplace duplicate-prevention checks passed.");
