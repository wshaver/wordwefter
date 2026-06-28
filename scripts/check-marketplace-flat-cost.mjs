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

const game = new WordWefterGameState({
  playerNames: ["Ada"],
  gameLength: "short"
});

[0, 1, 2, 3, 8, 21].forEach((purchaseCount) => {
  assert.equal(
    game.getMarketplaceTileCostForPurchaseCount(purchaseCount),
    5,
    `purchase count ${purchaseCount} should cost 5`
  );
});

game.players[0].score = 20;
game.marketplaceTiles = [
  { id: "market-a", letter: "A", points: 1 },
  { id: "market-b", letter: "B", points: 3 }
];

const firstTile = game.buyMarketplaceTile("market-a");
assert.equal(firstTile.marketplaceCost, 5, "first tile purchase should record a 5-point cost");
assert.equal(game.currentScore, 15, "first tile purchase should subtract 5 points");

const secondTile = game.buyMarketplaceTile("market-b");
assert.equal(secondTile.marketplaceCost, 5, "second tile purchase should record a 5-point cost");
assert.equal(game.currentScore, 10, "second tile purchase should subtract another 5 points");

console.log("Marketplace flat-cost checks passed.");
