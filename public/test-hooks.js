export function installWordWefterTestHooks(context) {
  const {
    WordWefterGameState,
    gameState,
    boardSize,
    startCell,
    wildcardLetter,
    playableLetters,
    bonusTypes,
    gameLengthSettings,
    letter_points,
    shouldShowLastTurnNotice,
    startNewGame,
    shuffleRackTiles,
    redrawTilesAndSkipTurn,
    passTurn,
    confirmPassTurn,
    concedeGame,
    confirmConcedeGame,
    finishPlacement,
    resetPlacement
  } = context;

function createPoolSnapshotForTesting(game = gameState) {
  return {
    gameId: game.id,
    gameLength: game.gameLength,
    rackCount: game.currentRack.length,
    tilesRemaining: game.tilesRemaining,
    tilesDrawn: game.tilesDrawn,
    totalTilePool: game.totalTilePool
  };
}

function createRackBalanceTestPool(overrides = {}) {
  return [wildcardLetter, ...playableLetters].reduce((pool, letter) => {
    pool[letter] = Math.max(0, Number(overrides[letter] || 0));
    return pool;
  }, {});
}

function createRackBalanceTestTiles(letters) {
  return String(letters || "").split("").map((letter, index) => ({
    id: `balance-test-${index}`,
    letter: letter.toUpperCase(),
    points: letter_points[String(letter || "").toUpperCase()] || 0
  }));
}

function withTemporaryRandom(randomValue, callback) {
  const originalRandom = Math.random;

  Math.random = () => randomValue;

  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function runRackBalanceDrawCase({ pool, rack, randomValue }) {
  const testPool = createRackBalanceTestPool(pool);
  const testGame = new WordWefterGameState({
    playerNames: ["Test Player", "Test Opponent"],
    startingLettersAvailable: testPool,
    lettersAvailable: testPool
  });

  return withTemporaryRandom(randomValue, () => testGame.drawTile({
    rackBalanceTiles: createRackBalanceTestTiles(rack)
  })?.letter || null);
}

function runRackBalanceDrawCheck() {
  const balancedTestPool = createRackBalanceTestPool({ A: 1, B: 1 });
  const balancedTestGame = new WordWefterGameState({
    playerNames: ["Test Player", "Test Opponent"],
    startingLettersAvailable: balancedTestPool,
    lettersAvailable: balancedTestPool
  });
  const balancedRack = createRackBalanceTestTiles("AAABBB");
  const balancedRackBalance = balancedTestGame.getRackVowelBalance(balancedRack);
  const balancedWeightedLetters = Object.entries(balancedTestGame.lettersAvailable)
    .filter(([, count]) => count > 0);
  const balancedMultipliers = balancedWeightedLetters.reduce((multipliers, [letter]) => {
    multipliers[letter] = balancedTestGame.getRackBalanceDrawMultiplier(
      letter,
      balancedRackBalance,
      balancedWeightedLetters
    );
    return multipliers;
  }, {});
  const cases = {
    extraNonVowelFavorsVowel: runRackBalanceDrawCase({
      pool: { A: 1, B: 1 },
      rack: "WRA",
      randomValue: 0.52
    }),
    extraVowelsFavorNonVowel: runRackBalanceDrawCase({
      pool: { A: 1, B: 1 },
      rack: "AAA",
      randomValue: 0.5
    }),
    balancedRackMultipliers: balancedMultipliers,
    unavailableVowelsFallbackToRemaining: runRackBalanceDrawCase({
      pool: { B: 1 },
      rack: "BBB",
      randomValue: 0.99
    }),
    unavailableNonVowelsFallbackToRemaining: runRackBalanceDrawCase({
      pool: { A: 1 },
      rack: "AAA",
      randomValue: 0.99
    })
  };

  return {
    cases,
    passed:
      cases.extraNonVowelFavorsVowel === "A" &&
      cases.extraVowelsFavorNonVowel === "B" &&
      cases.balancedRackMultipliers.A === 1 &&
      cases.balancedRackMultipliers.B === 1 &&
      cases.unavailableVowelsFallbackToRemaining === "B" &&
      cases.unavailableNonVowelsFallbackToRemaining === "A"
  };
}

function runRedrawPoolAccountingCheck(setup = {}) {
  const testGame = new WordWefterGameState({
    playerNames: ["Test Player", "Test Opponent"],
    gameLength: "normal",
    ...setup
  });

  testGame.currentRack = testGame.drawSevenTiles({ ensureRainbow: true });

  const before = createPoolSnapshotForTesting(testGame);
  testGame.redrawCurrentRack();
  const after = createPoolSnapshotForTesting(testGame);

  return {
    before,
    after,
    passed:
      before.rackCount === 7 &&
      after.rackCount === 7 &&
      before.tilesRemaining === after.tilesRemaining &&
      before.tilesDrawn === after.tilesDrawn &&
      before.totalTilePool === after.totalTilePool
  };
}

function runFinalRoundMarketplaceCloseCheck() {
  const emptyPool = playableLetters.reduce((pool, letter) => {
    pool[letter] = 0;
    return pool;
  }, { [wildcardLetter]: 0 });
  const testGame = new WordWefterGameState({
    playerNames: ["Test Player", "Test Opponent", "Test Third"],
    gameLength: "short"
  });

  testGame.startingLettersAvailable = {
    ...emptyPool,
    E: 2
  };
  testGame.lettersAvailable = { ...emptyPool };
  testGame.tilesDrawn = 2;
  testGame.marketplaceTiles = [
    { id: "market-e", letter: "E", points: 1 },
    { id: "market-e-2", letter: "E", points: 1 }
  ];
  testGame.currentRack = [];

  const firstDraw = testGame.drawTiles(1);
  const afterClose = createPoolSnapshotForTesting(testGame);
  const secondDraw = testGame.drawTiles(7);
  const afterFinalStart = createPoolSnapshotForTesting(testGame);

  testGame.advanceTurn();
  testGame.advanceTurnIndex();
  const afterArmingFinalRound = {
    currentPlayerIndex: testGame.currentPlayerIndex,
    finalTurnsRemaining: testGame.finalTurnsRemaining,
    pendingFinalRound: testGame.pendingFinalRound,
    gameOver: testGame.gameOver
  };

  testGame.advanceTurn();
  testGame.advanceTurnIndex();
  testGame.advanceTurn();
  testGame.advanceTurnIndex();
  const beforeLastFinalTurn = {
    currentPlayerIndex: testGame.currentPlayerIndex,
    finalTurnsRemaining: testGame.finalTurnsRemaining,
    gameOver: testGame.gameOver
  };

  testGame.advanceTurn();

  return {
    firstDrawCount: firstDraw.length,
    secondDrawCount: secondDraw.length,
    afterClose,
    afterFinalStart,
    afterArmingFinalRound,
    beforeLastFinalTurn,
    finalGameOver: testGame.gameOver,
    passed:
      firstDraw.length === 1 &&
      secondDraw.length === 1 &&
      testGame.marketplaceClosed &&
      testGame.marketplaceTiles.length === 0 &&
      afterClose.tilesRemaining === 1 &&
      afterFinalStart.tilesRemaining === 0 &&
      afterFinalStart.tilesDrawn === 2 &&
      afterArmingFinalRound.currentPlayerIndex === 1 &&
      afterArmingFinalRound.finalTurnsRemaining === 3 &&
      !afterArmingFinalRound.pendingFinalRound &&
      !afterArmingFinalRound.gameOver &&
      beforeLastFinalTurn.currentPlayerIndex === 0 &&
      beforeLastFinalTurn.finalTurnsRemaining === 1 &&
      testGame.gameOver
  };
}

function createWildcardPivotTestTile(id, letter, row, column) {
  return {
    id,
    letter,
    points: letter === wildcardLetter ? 0 : letter_points[letter],
    row,
    column
  };
}

function runWildcardPivotResolutionCase(dictionaryWords) {
  const testGame = new WordWefterGameState({
    playerNames: ["Test Player", "Test Opponent"],
    dictionary: new Set(dictionaryWords)
  });

  testGame.boardTiles = new Map();
  testGame.activePlacements = new Map();
  testGame.currentRack = [{
    id: "wild-pivot",
    letter: wildcardLetter,
    points: 0,
    wildcard: true
  }];
  testGame.boardTiles.set(testGame.getCellKey(3, 4), createWildcardPivotTestTile("c", "C", 3, 4));
  testGame.boardTiles.set(testGame.getCellKey(5, 4), createWildcardPivotTestTile("t", "T", 5, 4));
  testGame.boardTiles.set(testGame.getCellKey(4, 3), createWildcardPivotTestTile("b", "B", 4, 3));
  testGame.boardTiles.set(testGame.getCellKey(4, 5), createWildcardPivotTestTile("d", "D", 4, 5));

  const placed = testGame.placeRackTile("wild-pivot", 4, 4);
  const resolution = testGame.getWildcardResolution();
  const changedWords = testGame.getChangedWords(resolution.assignments, { includeSingleFallback: true })
    .map((word) => word.word);
  const boardValidation = testGame.validateBoardWordsWithWildcardAssignments(resolution.assignments);
  const finishResult = testGame.finishActivePlacements();
  const committedPivot = testGame.getVisibleBoardTileAt(4, 4);

  return {
    placed,
    resolutionValid: resolution.isValid,
    assignments: Array.from(resolution.assignments.entries()),
    changedWords,
    boardWords: boardValidation.words,
    boardValid: boardValidation.isValid,
    finishValid: finishResult.isValid,
    finishWords: finishResult.words,
    finishInvalidWords: finishResult.invalidWords,
    placementError: finishResult.placementError || "",
    committedPivotLetter: committedPivot?.letter || null,
    committedPivotWildcard: Boolean(committedPivot?.wildcard)
  };
}

function runWildcardPivotResolutionCheck() {
  const sharedLetterSucceeds = runWildcardPivotResolutionCase(["CAT", "BAD"]);
  const conflictingLettersFail = runWildcardPivotResolutionCase(["COT", "BAD"]);

  return {
    sharedLetterSucceeds,
    conflictingLettersFail,
    passed:
      sharedLetterSucceeds.placed &&
      sharedLetterSucceeds.resolutionValid &&
      sharedLetterSucceeds.finishValid &&
      sharedLetterSucceeds.committedPivotLetter === "A" &&
      sharedLetterSucceeds.changedWords.includes("CAT") &&
      sharedLetterSucceeds.changedWords.includes("BAD") &&
      conflictingLettersFail.placed &&
      !conflictingLettersFail.resolutionValid &&
      !conflictingLettersFail.finishValid
  };
}

function publishWordWefterTestingGlobals(target, testGlobals) {
  if (!target) {
    return;
  }

  Object.entries({
    WordWefterGameState,
    wordWefterGame: gameState,
    isWordWefterWord: testGlobals.isWord,
    wordWefterTest: testGlobals
  }).forEach(([name, value]) => {
    try {
      Object.defineProperty(target, name, {
        configurable: true,
        writable: false,
        value
      });
    } catch (error) {
      try {
        target[name] = value;
      } catch (assignmentError) {
        // Some browser inspection contexts reject global writes; dataset markers below are the fallback.
      }
    }
  });
}

function updateWordWefterTestingDataset() {
  const dataset = document.documentElement.dataset;

  dataset.wordWefterCurrentPoolSnapshot = JSON.stringify(createPoolSnapshotForTesting());
  dataset.wordWefterCurrentPlayerIndex = String(gameState.currentPlayerIndex);
  dataset.wordWefterCurrentTurnIndex = String(gameState.turnIndex);
  dataset.wordWefterGameOver = String(gameState.gameOver);
  dataset.wordWefterMarketplaceClosed = String(gameState.marketplaceClosed);
  dataset.wordWefterFinalTurnsRemaining = String(gameState.finalTurnsRemaining ?? "");
  dataset.wordWefterPendingFinalRound = String(gameState.pendingFinalRound);
  dataset.wordWefterCurrentPlayerLastTurn = String(gameState.isCurrentPlayerLastTurn());
  dataset.wordWefterDisplayedLastTurnNotice = String(shouldShowLastTurnNotice());
}

function exposeWordWefterTestingGlobals() {
  const testGlobals = {
    WordWefterGameState,
    gameState,
    boardSize,
    startCell: { ...startCell },
    wildcardLetter,
    playableLetters: [...playableLetters],
    bonusTypes,
    gameLengthSettings,
    createGameState: (setup = {}) => new WordWefterGameState(setup),
    getGameState: () => gameState,
    getPoolSnapshot: (game = gameState) => createPoolSnapshotForTesting(game),
    runRackBalanceDrawCheck,
    runRedrawPoolAccountingCheck,
    runFinalRoundMarketplaceCloseCheck,
    runWildcardPivotResolutionCheck,
    isWord: (word) => gameState.isRealWord(word)
  };

  publishWordWefterTestingGlobals(globalThis, testGlobals);
  publishWordWefterTestingGlobals(globalThis.window, testGlobals);
  publishWordWefterTestingGlobals(globalThis.document, testGlobals);
  publishWordWefterTestingGlobals(globalThis.document?.documentElement, testGlobals);

  document.documentElement.dataset.wordWefterTestReady = "true";
  document.documentElement.dataset.wordWefterBoardSize = String(boardSize);
  document.documentElement.dataset.wordWefterStartCell = `${startCell.row},${startCell.column}`;
  document.documentElement.dataset.wordWefterWildcardLetter = wildcardLetter;
  document.documentElement.dataset.wordWefterTestGlobalNames = [
    "WordWefterGameState",
    "wordWefterGame",
    "wordWefterTest",
    "isWordWefterWord"
  ].join(",");
  document.documentElement.dataset.wordWefterRedrawPoolAccountingCheck = JSON.stringify(
    runRedrawPoolAccountingCheck()
  );
  document.documentElement.dataset.wordWefterRackBalanceDrawCheck = JSON.stringify(
    runRackBalanceDrawCheck()
  );
  document.documentElement.dataset.wordWefterFinalRoundMarketplaceCloseCheck = JSON.stringify(
    runFinalRoundMarketplaceCloseCheck()
  );
  document.documentElement.dataset.wordWefterWildcardPivotResolutionCheck = JSON.stringify(
    runWildcardPivotResolutionCheck()
  );
  updateWordWefterTestingDataset();
}

exposeWordWefterTestingGlobals();

  function publishWordWefterActionGlobals(target) {
    if (!target) {
      return;
    }

    Object.entries({
      startWordWefterGame: startNewGame,
      shuffleWordWefterRack: shuffleRackTiles,
      redrawWordWefterTiles: redrawTilesAndSkipTurn,
      passWordWefterTurn: passTurn,
      confirmWordWefterPass: confirmPassTurn,
      concedeWordWefterGame: concedeGame,
      confirmWordWefterConcede: confirmConcedeGame,
      finishWordWefterPlacement: finishPlacement,
      resetWordWefterPlacement: resetPlacement
    }).forEach(([name, value]) => {
      try {
        Object.defineProperty(target, name, {
          configurable: true,
          writable: false,
          value
        });
      } catch {
        try {
          target[name] = value;
        } catch {
        }
      }
    });
  }

  publishWordWefterActionGlobals(globalThis);
  publishWordWefterActionGlobals(globalThis.window);

  return {
    updateWordWefterTestingDataset
  };
}
