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

const blankTileLetter = " ";
const wildcardLetter = "?";

function makeTile(letter, index, extra = {}) {
  return {
    id: `${letter || "blank"}-${index}`,
    letter,
    points: letter === blankTileLetter || letter === wildcardLetter ? 0 : 1,
    ...(letter === wildcardLetter ? { wildcard: true } : {}),
    ...extra
  };
}

function createGame(dictionaryWords = []) {
  return new WordWefterGameState({
    playerNames: ["Ada"],
    gameLength: "short",
    dictionary: new Set(dictionaryWords)
  });
}

function placeRackWord(game, word, row, startColumn) {
  game.currentRack = word.split("").map(makeTile);
  word.split("").forEach((letter, index) => {
    assert.equal(
      game.placeRackTile(`${letter}-${index}`, row, startColumn + index),
      true,
      `should place ${letter} at ${row},${startColumn + index}`
    );
  });
}

{
  const game = createGame();
  const wildCount = game.startingLettersAvailable[wildcardLetter];

  assert.equal(
    game.startingLettersAvailable[blankTileLetter],
    wildCount,
    "new games should add one blank tile for each wild tile"
  );

  game.lettersAvailable = {
    [blankTileLetter]: 7,
    A: 7
  };
  game.currentRack = [];
  game.drawSevenTiles({ excludeBlanks: true });

  assert.equal(
    game.currentRack.some((tile) => tile.letter === blankTileLetter || tile.blank),
    false,
    "starting-rack draws should be able to exclude blanks"
  );
}

{
  const game = createGame();

  game.currentRack = [makeTile(blankTileLetter, "rack", { blank: true })];
  game.lettersAvailable = {
    [blankTileLetter]: 4,
    A: 4
  };
  game.drawTiles(3);

  assert.equal(
    game.currentRack.filter((tile) => tile.letter === blankTileLetter || tile.blank).length,
    1,
    "rack draws should not add a blank when the player already has one"
  );
}

{
  const game = createGame();

  game.currentRack = [];
  game.lettersAvailable = {
    [blankTileLetter]: 4,
    A: 4
  };
  game.drawTiles(4);

  assert.equal(
    game.currentRack.filter((tile) => tile.letter === blankTileLetter || tile.blank).length,
    1,
    "a single rack draw batch should draw at most one blank"
  );
}

{
  const game = createGame(["RACECARE", "RACE", "ARE", "TO"]);

  placeRackWord(game, "RACECARE", 4, 0);
  assert.equal(game.finishActivePlacements().isValid, true, "initial base word should be valid");

  const blankTile = makeTile(blankTileLetter, 1, { blank: true, rainbow: true });
  game.currentRack = [blankTile, makeTile("T", 2), makeTile("O", 3)];

  assert.equal(
    game.placeRackTile(blankTile.id, 3, 3),
    false,
    "blank tiles should not be placeable on empty board squares"
  );
  assert.equal(
    game.placeRackTile(blankTile.id, 4, 4),
    true,
    "blank tiles should be placeable on top of existing tiles"
  );
  assert.equal(game.placeRackTile("T-2", 2, 4), true, "letter placement should connect through blank column");
  assert.equal(game.placeRackTile("O-3", 3, 4), true, "letter placement should form a real connected word");

  const result = game.finishActivePlacements();
  assert.equal(
    result.isValid,
    true,
    `blank split plus connected word should be a legal turn: ${result.placementError || result.invalidWords?.join(",") || "no detail"}`
  );
  const turnWords = result.turnWords.map((entry) => entry.word).sort();
  const committedBlank = game.getVisibleBoardTileAt(4, 4);

  assert.deepEqual(turnWords, ["ARE", "RACE", "TO"], "blank should split the covered row word into two scored words");
  assert.equal(committedBlank.blank, true, "committed blank tile should preserve blank identity");
  assert.equal(committedBlank.rainbow, undefined, "blank tiles should never be rainbow");

  game.currentRack = [makeTile("G", 4)];
  assert.equal(game.placeRackTile("G-4", 4, 4), true, "letter tiles should be playable on top of blanks");
}

console.log("Blank tile checks passed.");
