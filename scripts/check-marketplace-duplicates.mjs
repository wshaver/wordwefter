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

  const loadedGameWithPersistedDuplicate = new WordWefterGameState({
    playerNames: ["Ada"],
    gameLength: "short"
  });

  loadedGameWithPersistedDuplicate.loadFromJSON({
    version: 1,
    id: "DUPES",
    startDate: "2026-06-30T00:00:00.000Z",
    gameLength: "short",
    tilesDrawn: 3,
    turnIndex: 1,
    currentPlayerIndex: 0,
    history: [{ turnIndex: 0, playerName: "Ada", words: [{ word: "AB", score: 2 }] }],
    players: [{ name: "Ada", rack: [] }],
    startingLettersAvailable: { A: 3, B: 3, C: 3 },
    lettersAvailable: { A: 2, B: 1, C: 3 },
    boardTiles: [],
    boardBonuses: [],
    marketplaceTiles: [{ letter: "B" }, { letter: "B" }, { letter: "C" }]
  });

  const loadedMarketplaceLetters = getMarketplaceLetters(loadedGameWithPersistedDuplicate);

  assert.equal(
    new Set(loadedMarketplaceLetters).size,
    loadedMarketplaceLetters.length,
    "loading a saved marketplace should replace duplicate letters when alternatives are available"
  );
  assert.equal(
    loadedMarketplaceLetters[0],
    "B",
    "loading a saved marketplace should keep the first copy of a duplicated letter"
  );
  assert.equal(
    loadedMarketplaceLetters[2],
    "C",
    "loading a saved marketplace should keep already unique letters"
  );
} finally {
  Math.random = originalRandom;
}

console.log("Marketplace duplicate-prevention checks passed.");
