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

const { boardSize, startCell } = await import("../src/game-config.js");
const { WordWefterGameState } = await import("../src/game-state.js");

const originalRandom = Math.random;

try {
  Math.random = () => 0;

  const game = new WordWefterGameState({
    playerNames: ["Ada"],
    gameLength: "short"
  });
  const boardBonuses = game.createBoardBonuses();
  const centerLineBonuses = Array.from(boardBonuses.keys())
    .map((cellKey) => cellKey.split(",").map(Number))
    .filter(([row, column]) => row === startCell.row || column === startCell.column);

  assert.equal(boardSize, 9, "center-line bonus check assumes the 9x9 board.");
  assert.deepEqual(
    centerLineBonuses,
    [],
    "bonus squares should not appear in the center row or center column"
  );
} finally {
  Math.random = originalRandom;
}

console.log("Board bonus center-line checks passed.");
