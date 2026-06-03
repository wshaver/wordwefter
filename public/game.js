import { dictionaryWordSet } from "./dictionary.js";
import { letter_freq, letter_points, letters_available } from "./letter-setup.js";

const bonusTypes = {
  doubleLetter: {
    label: "DL",
    scope: "letter",
    multiplier: 2,
    probability: 0.14
  },
  tripleLetter: {
    label: "TL",
    scope: "letter",
    multiplier: 3,
    probability: 0.055
  },
  doubleWord: {
    label: "DW",
    scope: "word",
    multiplier: 2,
    probability: 0.045
  },
  tripleWord: {
    label: "TW",
    scope: "word",
    multiplier: 3,
    probability: 0.018
  }
};

const gameLengthSettings = {
  short: {
    label: "Short",
    drawThresholdRatio: 1 / 3
  },
  medium: {
    label: "Medium",
    drawThresholdRatio: 2 / 3
  },
  long: {
    label: "Long",
    drawThresholdRatio: null
  }
};

const wildcardLetter = "?";
const playableLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const rackWildcardProbability = 1 / 14;

class WordWefterGameState {
  constructor(setup = {}) {
    const playerNames = setup.playerNames || [setup.playerName || "Player 1"];

    this.id = setup.id || WordWefterGameState.createGameId();
    this.startDate = setup.startDate || new Date().toISOString();
    this.lastPlayDate = setup.lastPlayDate || this.startDate;
    this.letterFrequencies = { ...letter_freq, ...setup.letterFrequencies };
    this.letterPoints = { ...letter_points, ...setup.letterPoints };
    this.startingLettersAvailable = { ...letters_available, ...setup.lettersAvailable };
    this.lettersAvailable = { ...this.startingLettersAvailable };
    this.gameLength = gameLengthSettings[setup.gameLength] ? setup.gameLength : "medium";
    this.tilesDrawn = Number.isInteger(Number(setup.tilesDrawn)) ? Math.max(0, Number(setup.tilesDrawn)) : 0;
    this.finalTurnsRemaining = Number.isInteger(Number(setup.finalTurnsRemaining))
      ? Math.max(0, Number(setup.finalTurnsRemaining))
      : null;
    this.pendingFinalRound = Boolean(setup.pendingFinalRound);
    this.gameOver = Boolean(setup.gameOver);
    this.dictionary = setup.dictionary || dictionaryWordSet;
    this.players = this.normalizePlayers(playerNames);
    this.currentPlayerIndex = 0;
    this.turnIndex = Number.isInteger(Number(setup.turnIndex)) ? Number(setup.turnIndex) : 0;
    this.discardedTiles = [];
    this.boardTiles = new Map();
    this.boardBonuses = new Map();
    this.marketplaceTiles = [];
    this.activePlacements = new Map();
    this.pendingMarketplacePurchaseTileIds = new Set();
    this.pendingMarketplacePurchasePlayerIndex = null;
    this.pendingMarketplacePurchaseCountStart = null;
    this.pendingMarketplacePurchaseScoreStart = null;
    this.nextTileId = 1;
    this.flashActivePlacements = false;
  }

  static createGameId() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    return Array.from({ length: 5 }, () => (
      alphabet[Math.floor(Math.random() * alphabet.length)]
    )).join("");
  }

  normalizePlayers(playerNames) {
    const names = (Array.isArray(playerNames) ? playerNames : [playerNames])
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    const uniqueNames = names.length > 0 ? names : ["Player 1"];

    return uniqueNames.map((name) => ({
      name,
      score: 0,
      marketplacePurchaseCount: 0,
      rack: []
    }));
  }

  get player() {
    return this.players[this.currentPlayerIndex] || this.players[0];
  }

  set player(player) {
    this.players = [player];
    this.currentPlayerIndex = 0;
  }

  get tilesRemaining() {
    return Object.entries(this.lettersAvailable)
      .filter(([letter]) => letter !== wildcardLetter)
      .reduce((total, [, count]) => total + count, 0);
  }

  get totalTilePool() {
    return Object.entries(this.startingLettersAvailable)
      .filter(([letter]) => letter !== wildcardLetter)
      .reduce((total, [, count]) => total + count, 0);
  }

  get gameLengthSetting() {
    return gameLengthSettings[this.gameLength] || gameLengthSettings.medium;
  }

  get drawThreshold() {
    return this.gameLengthSetting.drawThresholdRatio === null
      ? null
      : Math.ceil(this.totalTilePool * this.gameLengthSetting.drawThresholdRatio);
  }

  get tilesUntilGameEndDrawTrigger() {
    return this.drawThreshold === null
      ? null
      : Math.max(0, this.drawThreshold - this.tilesDrawn);
  }

  get isFinalRound() {
    return Number.isInteger(this.finalTurnsRemaining);
  }

  get isFinalTurn() {
    return this.isFinalRound && this.finalTurnsRemaining > 0 && !this.gameOver;
  }

  get currentRack() {
    return this.player.rack;
  }

  set currentRack(rack) {
    this.player.rack = rack;
  }

  get currentScore() {
    return this.player.score;
  }

  set currentScore(score) {
    this.player.score = score;
  }

  get currentPlayerName() {
    return this.player.name;
  }

  setPlayerName(name) {
    const normalizedName = String(name || "").trim();

    this.player.name = normalizedName || "Player 1";
  }

  setPlayerNames(playerNames) {
    this.players = this.normalizePlayers(playerNames);
    this.currentPlayerIndex = 0;
  }

  setGameLength(gameLength) {
    this.gameLength = gameLengthSettings[gameLength] ? gameLength : "medium";
  }

  startFinalRound() {
    if (!this.isFinalRound) {
      this.finalTurnsRemaining = this.players.length;
      this.pendingFinalRound = false;
    }
  }

  completeTurn() {
    if (this.isFinalRound && this.finalTurnsRemaining > 0) {
      this.finalTurnsRemaining -= 1;

      if (this.finalTurnsRemaining === 0) {
        this.gameOver = true;
      }
    }
  }

  checkDrawTriggeredGameEnd() {
    if (
      this.gameLength !== "long" &&
      this.drawThreshold !== null &&
      this.tilesDrawn >= this.drawThreshold &&
      !this.isFinalRound
    ) {
      this.pendingFinalRound = true;
    }
  }

  advanceTurn() {
    const result = {
      drawnTiles: []
    };

    this.completeTurn();

    if (this.pendingFinalRound && !this.gameOver) {
      this.startFinalRound();
    }

    if (this.gameOver) {
      return result;
    }

    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

    if (this.currentRack.length === 0) {
      const drawnTiles = this.drawSevenTiles();

      result.drawnTiles = drawnTiles;

      if (this.gameLength === "long" && drawnTiles.length < 7) {
        this.startFinalRound();
      }
    }

    return result;
  }

  advanceTurnIndex() {
    this.turnIndex += 1;
  }

  drawTiles(tileCount = 7, options = {}) {
    if (!Number.isInteger(tileCount) || tileCount < 0) {
      throw new Error("tileCount must be a non-negative integer.");
    }

    const drawnTiles = [];

    while (drawnTiles.length < tileCount && this.tilesRemaining > 0) {
      const tile = this.drawTile();

      if (tile) {
        drawnTiles.push(this.prepareRackDrawnTile(tile, {
          forceNonWildcard: Boolean(options.ensureRainbow) &&
            drawnTiles.length === tileCount - 1 &&
            !drawnTiles.some((drawnTile) => !drawnTile.wildcard)
        }));
      }
    }

    if (options.ensureRainbow) {
      this.assignRainbowTile(drawnTiles);
    }

    this.currentRack.push(...drawnTiles);
    return drawnTiles;
  }

  drawSevenTiles(options = {}) {
    return this.drawTiles(7, options);
  }

  drawMarketplaceTiles(tileCount = 7) {
    const drawnTiles = [];

    while (
      (this.marketplaceTiles.length < tileCount || this.marketplaceTiles.some((tile) => !tile)) &&
      this.tilesRemaining > 0
    ) {
      const tile = this.drawTile();

      if (tile) {
        const emptyIndex = this.marketplaceTiles.findIndex((marketplaceTile) => !marketplaceTile);

        if (emptyIndex === -1) {
          this.marketplaceTiles.push(tile);
        } else {
          this.marketplaceTiles[emptyIndex] = tile;
        }
        drawnTiles.push(tile);
      }
    }

    return drawnTiles;
  }

  prepareRackDrawnTile(tile, options = {}) {
    if (
      !options.forceNonWildcard &&
      tile.letter !== wildcardLetter &&
      Math.random() < rackWildcardProbability
    ) {
      return {
        ...tile,
        letter: wildcardLetter,
        points: 0,
        frequency: this.letterFrequencies[wildcardLetter],
        wildcard: true,
        sourceLetter: tile.letter
      };
    }

    return tile;
  }

  assignRainbowTile(tiles) {
    const candidates = tiles.filter((tile) => !tile.wildcard);

    if (candidates.length === 0) {
      return null;
    }

    const rainbowTile = candidates[Math.floor(Math.random() * candidates.length)];

    rainbowTile.rainbow = true;
    return rainbowTile;
  }

  returnTileToAvailableLetters(tile) {
    const letter = String(tile?.sourceLetter || tile?.letter || "").toUpperCase();

    if (!letter || !Object.hasOwn(this.lettersAvailable, letter)) {
      return;
    }

    this.lettersAvailable[letter] += 1;
  }

  redrawCurrentRack(options = {}) {
    if (options.availableOnly) {
      this.discardedTiles.push(...this.currentRack);
    } else {
      this.currentRack.forEach((tile) => {
        this.returnTileToAvailableLetters(tile);
      });
    }

    this.currentRack = [];

    return this.drawSevenTiles();
  }

  getMarketplaceTileCost(player = this.player) {
    return this.getMarketplaceTileCostForPurchaseCount(player?.marketplacePurchaseCount || 0);
  }

  getMarketplaceTileCostForPurchaseCount(purchaseCountValue) {
    const purchaseCount = Math.max(0, Number(purchaseCountValue || 0));
    let previousCost = 5;
    let currentCost = 10;

    if (purchaseCount === 0) {
      return previousCost;
    }

    if (purchaseCount === 1) {
      return currentCost;
    }

    for (let index = 2; index <= purchaseCount; index += 1) {
      const nextCost = previousCost + currentCost;

      previousCost = currentCost;
      currentCost = nextCost;
    }

    return currentCost;
  }

  canBuyTile(tileId) {
    const tile = this.marketplaceTiles.find((marketplaceTile) => marketplaceTile?.id === tileId);

    return Boolean(tile) && this.currentScore >= this.getMarketplaceTileCost();
  }

  beginMarketplacePurchaseTurn() {
    if (this.pendingMarketplacePurchasePlayerIndex !== this.currentPlayerIndex) {
      this.pendingMarketplacePurchaseTileIds.clear();
      this.pendingMarketplacePurchasePlayerIndex = this.currentPlayerIndex;
      this.pendingMarketplacePurchaseCountStart = Math.max(0, Number(this.player.marketplacePurchaseCount || 0));
      this.pendingMarketplacePurchaseScoreStart = Number(this.currentScore || 0);
    }
  }

  buyMarketplaceTile(tileId) {
    const tileIndex = this.marketplaceTiles.findIndex((tile) => tile?.id === tileId);

    if (tileIndex === -1) {
      return null;
    }

    const tile = this.marketplaceTiles[tileIndex];

    if (!this.canBuyTile(tile.id)) {
      return null;
    }

    this.beginMarketplacePurchaseTurn();
    const marketplaceCost = this.getMarketplaceTileCost();

    this.currentScore -= marketplaceCost;
    this.player.marketplacePurchaseCount = Math.max(0, Number(this.player.marketplacePurchaseCount || 0)) + 1;
    this.marketplaceTiles[tileIndex] = null;
    this.pendingMarketplacePurchaseTileIds.add(tile.id);

    return {
      ...tile,
      pendingMarketplace: true,
      marketplaceIndex: tileIndex,
      marketplaceCost
    };
  }

  stripPendingMarketplaceTile(tile) {
    const {
      pendingMarketplace,
      marketplaceIndex,
      marketplaceCost,
      ...cleanTile
    } = tile;

    return cleanTile;
  }

  getMarketplaceTileForRack(tile) {
    const cleanTile = this.stripPendingMarketplaceTile(tile);
    return {
      id: cleanTile.id,
      letter: cleanTile.letter,
      points: cleanTile.points,
      frequency: cleanTile.frequency,
      ...(cleanTile.wildcard ? { wildcard: true } : {}),
      ...(cleanTile.rainbow && !cleanTile.wildcard ? { rainbow: true } : {}),
      ...(cleanTile.sourceLetter ? { sourceLetter: cleanTile.sourceLetter } : {})
    };
  }

  returnPendingMarketplaceTile(tile) {
    if (!tile?.pendingMarketplace) {
      return false;
    }

    const cleanTile = this.stripPendingMarketplaceTile(tile);
    const preferredIndex = Number(tile.marketplaceIndex);

    if (
      Number.isInteger(preferredIndex) &&
      preferredIndex >= 0 &&
      preferredIndex < Math.max(7, this.marketplaceTiles.length) &&
      !this.marketplaceTiles[preferredIndex]
    ) {
      this.marketplaceTiles[preferredIndex] = cleanTile;
    } else {
      const emptyIndex = this.marketplaceTiles.findIndex((marketplaceTile) => !marketplaceTile);

      if (emptyIndex === -1) {
        this.marketplaceTiles.push(cleanTile);
      } else {
        this.marketplaceTiles[emptyIndex] = cleanTile;
      }
    }

    this.pendingMarketplacePurchaseTileIds.delete(tile.id);
    this.syncPendingMarketplacePurchaseTotals();
    return true;
  }

  getPendingMarketplaceTiles() {
    return [
      ...this.currentRack.filter((tile) => tile.pendingMarketplace),
      ...Array.from(this.activePlacements.values()).filter((tile) => tile.pendingMarketplace)
    ];
  }

  syncPendingMarketplacePurchaseTotals() {
    if (
      this.pendingMarketplacePurchasePlayerIndex !== this.currentPlayerIndex ||
      !Number.isInteger(this.pendingMarketplacePurchaseCountStart) ||
      !Number.isFinite(this.pendingMarketplacePurchaseScoreStart)
    ) {
      return;
    }

    const pendingTiles = this.getPendingMarketplaceTiles()
      .sort((first, second) => Math.max(0, Number(first.marketplaceCost || 0)) - Math.max(0, Number(second.marketplaceCost || 0)));
    const pendingCost = pendingTiles.reduce((total, tile, index) => {
      const marketplaceCost = this.getMarketplaceTileCostForPurchaseCount(this.pendingMarketplacePurchaseCountStart + index);

      tile.marketplaceCost = marketplaceCost;
      return total + marketplaceCost;
    }, 0);

    this.player.marketplacePurchaseCount = this.pendingMarketplacePurchaseCountStart + pendingTiles.length;
    this.currentScore = this.pendingMarketplacePurchaseScoreStart - pendingCost;
  }

  returnPendingMarketplaceTileFromRack(tileId) {
    const rackIndex = this.currentRack.findIndex((tile) => tile.id === tileId && tile.pendingMarketplace);

    if (rackIndex === -1) {
      return false;
    }

    const [tile] = this.currentRack.splice(rackIndex, 1);
    return this.returnPendingMarketplaceTile(tile);
  }

  returnPendingMarketplaceTileFromBoard(tileId) {
    const existingKey = this.findActiveTileKeyById(tileId);

    if (!existingKey) {
      return false;
    }

    const tile = this.activePlacements.get(existingKey);

    if (!tile?.pendingMarketplace) {
      return false;
    }

    this.activePlacements.delete(existingKey);
    this.flashActivePlacements = false;
    return this.returnPendingMarketplaceTile(tile);
  }

  returnPendingMarketplaceTileToMarketplace(tileId) {
    return this.returnPendingMarketplaceTileFromRack(tileId) ||
      this.returnPendingMarketplaceTileFromBoard(tileId);
  }

  hasPendingMarketplacePurchases() {
    return this.pendingMarketplacePurchaseTileIds.size > 0 ||
      this.currentRack.some((tile) => tile.pendingMarketplace) ||
      Array.from(this.activePlacements.values()).some((tile) => tile.pendingMarketplace);
  }

  commitMarketplacePurchases() {
    this.currentRack = this.currentRack.map((tile) => (
      tile.pendingMarketplace ? this.getMarketplaceTileForRack(tile) : tile
    ));
    this.activePlacements = new Map(Array.from(this.activePlacements.entries()).map(([cellKey, tile]) => [
      cellKey,
      tile.pendingMarketplace ? {
        ...this.stripPendingMarketplaceTile(tile),
        row: tile.row,
        column: tile.column,
        active: tile.active
      } : tile
    ]));
    this.pendingMarketplacePurchaseTileIds.clear();
    this.pendingMarketplacePurchasePlayerIndex = null;
    this.pendingMarketplacePurchaseCountStart = null;
    this.pendingMarketplacePurchaseScoreStart = null;
    this.drawMarketplaceTiles();
  }

  resetMarketplacePurchases() {
    if (!this.hasPendingMarketplacePurchases()) {
      return;
    }

    this.currentRack = this.currentRack.filter((tile) => {
      if (tile.pendingMarketplace) {
        this.returnPendingMarketplaceTile(tile);
        return false;
      }

      return true;
    });

    Array.from(this.activePlacements.entries()).forEach(([cellKey, tile]) => {
      if (tile.pendingMarketplace) {
        this.activePlacements.delete(cellKey);
        this.returnPendingMarketplaceTile(tile);
      }
    });

    if (
      this.pendingMarketplacePurchasePlayerIndex === this.currentPlayerIndex &&
      Number.isInteger(this.pendingMarketplacePurchaseCountStart)
    ) {
      this.player.marketplacePurchaseCount = this.pendingMarketplacePurchaseCountStart;
    }

    if (
      this.pendingMarketplacePurchasePlayerIndex === this.currentPlayerIndex &&
      Number.isFinite(this.pendingMarketplacePurchaseScoreStart)
    ) {
      this.currentScore = this.pendingMarketplacePurchaseScoreStart;
    }

    this.pendingMarketplacePurchaseTileIds.clear();
    this.pendingMarketplacePurchasePlayerIndex = null;
    this.pendingMarketplacePurchaseCountStart = null;
    this.pendingMarketplacePurchaseScoreStart = null;
  }

  drawTile() {
    const weightedLetters = Object.entries(this.lettersAvailable)
      .filter(([letter, count]) => letter !== wildcardLetter && count > 0);
    const totalWeight = weightedLetters.reduce((total, [, count]) => total + count, 0);

    if (totalWeight === 0) {
      return null;
    }

    let drawIndex = Math.floor(Math.random() * totalWeight);

    for (const [letter, count] of weightedLetters) {
      if (drawIndex < count) {
        this.lettersAvailable[letter] -= 1;
        this.tilesDrawn += 1;
        this.checkDrawTriggeredGameEnd();

        return {
          id: `tile-${this.nextTileId++}`,
          letter,
          points: this.letterPoints[letter],
          frequency: this.letterFrequencies[letter]
        };
      }

      drawIndex -= count;
    }

    return null;
  }

  reset() {
    this.lettersAvailable = { ...this.startingLettersAvailable };
    this.id = WordWefterGameState.createGameId();
    this.startDate = new Date().toISOString();
    this.players = this.players.map((player) => ({
      name: player.name,
      score: 0,
      marketplacePurchaseCount: 0,
      rack: []
    }));
    this.currentPlayerIndex = 0;
    this.turnIndex = 0;
    this.tilesDrawn = 0;
    this.finalTurnsRemaining = null;
    this.pendingFinalRound = false;
    this.gameOver = false;
    this.discardedTiles = [];
    this.boardTiles = new Map();
    this.boardBonuses = this.createBoardBonuses();
    this.marketplaceTiles = [];
    this.activePlacements = new Map();
    this.pendingMarketplacePurchaseTileIds.clear();
    this.pendingMarketplacePurchasePlayerIndex = null;
    this.pendingMarketplacePurchaseCountStart = null;
    this.pendingMarketplacePurchaseScoreStart = null;
    this.nextTileId = 1;
    this.flashActivePlacements = false;
    this.drawMarketplaceTiles();
  }

  createBoardBonuses() {
    const boardBonuses = new Map();
    const weightedBonusTypes = Object.entries(bonusTypes)
      .filter(([, bonusType]) => bonusType.probability > 0);
    const totalProbability = weightedBonusTypes
      .reduce((total, [, bonusType]) => total + bonusType.probability, 0);

    for (let row = 0; row < boardSize; row += 1) {
      for (let column = 0; column < boardSize; column += 1) {
        if (this.isStartCell(row, column)) {
          continue;
        }

        if (this.hasOrthogonalBonus(boardBonuses, row, column)) {
          continue;
        }

        let roll = Math.random();

        if (roll >= totalProbability) {
          continue;
        }

        for (const [type, bonusType] of weightedBonusTypes) {
          roll -= bonusType.probability;

          if (roll < 0) {
            if (
              bonusType.scope === "word" &&
              this.hasWordBonusInLine(boardBonuses, row, column)
            ) {
              break;
            }

            boardBonuses.set(this.getCellKey(row, column), { type });
            break;
          }
        }
      }
    }

    this.ensureMinimumBoardBonuses(boardBonuses, "tripleWord", 2);
    this.ensureMinimumBoardBonuses(boardBonuses, "doubleWord", 3);

    return boardBonuses;
  }

  countBoardBonuses(boardBonuses, type) {
    return Array.from(boardBonuses.values())
      .filter((bonus) => bonus.type === type)
      .length;
  }

  hasWordBonusInLine(boardBonuses, row, column) {
    return Array.from(boardBonuses.entries()).some(([cellKey, bonus]) => {
      const bonusType = bonusTypes[bonus.type];

      if (bonusType?.scope !== "word") {
        return false;
      }

      const [bonusRow, bonusColumn] = cellKey.split(",").map(Number);

      return bonusRow === row || bonusColumn === column;
    });
  }

  ensureMinimumBoardBonuses(boardBonuses, type, minimumCount) {
    while (this.countBoardBonuses(boardBonuses, type) < minimumCount) {
      const cellKey = this.findBonusCellKey(boardBonuses, {
        avoidOrthogonal: true,
        avoidWordBonusLine: bonusTypes[type]?.scope === "word"
      }) || this.findBonusCellKey(boardBonuses, {
        avoidOrthogonal: false,
        avoidWordBonusLine: bonusTypes[type]?.scope === "word"
      });

      if (!cellKey) {
        return;
      }

      boardBonuses.set(cellKey, { type });
    }
  }

  findBonusCellKey(boardBonuses, options = {}) {
    const candidates = [];

    for (let row = 0; row < boardSize; row += 1) {
      for (let column = 0; column < boardSize; column += 1) {
        const cellKey = this.getCellKey(row, column);

        if (boardBonuses.has(cellKey)) {
          continue;
        }

        if (options.avoidOrthogonal && this.hasOrthogonalBonus(boardBonuses, row, column)) {
          continue;
        }

        if (options.avoidWordBonusLine && this.hasWordBonusInLine(boardBonuses, row, column)) {
          continue;
        }

        candidates.push(cellKey);
      }
    }

    return candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : null;
  }

  hasOrthogonalBonus(boardBonuses, row, column) {
    return [
      [row - 1, column],
      [row + 1, column],
      [row, column - 1],
      [row, column + 1]
    ].some(([neighborRow, neighborColumn]) => (
      boardBonuses.has(this.getCellKey(neighborRow, neighborColumn))
    ));
  }

  serializeBonus(bonus, cellKey = "") {
    const [row, column] = cellKey.split(",").map(Number);

    return {
      type: bonus.type,
      ...(Number.isInteger(row) ? { row } : {}),
      ...(Number.isInteger(column) ? { column } : {})
    };
  }

  getBonusAt(row, column) {
    return this.boardBonuses.get(this.getCellKey(row, column)) || null;
  }

  isStartCell(row, column) {
    return Number(row) === startCell.row && Number(column) === startCell.column;
  }

  mapToTileArray(tileMap) {
    return Array.from(tileMap.values()).map((tile) => ({ ...tile }));
  }

  serializeTile(tile) {
    return {
      letter: tile.letter,
      ...(tile.wildcard ? { wildcard: true } : {}),
      ...(tile.rainbow && !tile.wildcard ? { rainbow: true } : {}),
      ...(tile.sourceLetter ? { sourceLetter: tile.sourceLetter } : {}),
      ...(tile.pendingMarketplace ? { pendingMarketplace: true } : {}),
      ...(Number.isInteger(tile.marketplaceIndex) ? { marketplaceIndex: tile.marketplaceIndex } : {}),
      ...(Number.isFinite(tile.marketplaceCost) ? { marketplaceCost: tile.marketplaceCost } : {}),
      ...(Number.isInteger(tile.row) ? { row: tile.row } : {}),
      ...(Number.isInteger(tile.column) ? { column: tile.column } : {})
    };
  }

  getTileStack(tile) {
    return Array.isArray(tile?.stack) && tile.stack.length > 0
      ? tile.stack
      : tile
        ? [tile]
        : [];
  }

  getTopStackTile(tile) {
    const stack = this.getTileStack(tile);

    return stack[stack.length - 1] || null;
  }

  serializeBoardTile(tile) {
    const serializedTile = this.serializeTile(tile);
    const stack = this.getTileStack(tile);

    if (stack.length > 1) {
      serializedTile.stack = stack.map((stackTile) => this.serializeTile(stackTile));
    }

    return serializedTile;
  }

  toJSON() {
    return {
      version: 1,
      id: this.id,
      startDate: this.startDate,
      lastPlayDate: this.lastPlayDate,
      gameLength: this.gameLength,
      tilesDrawn: this.tilesDrawn,
      ...(this.isFinalRound ? { finalTurnsRemaining: this.finalTurnsRemaining } : {}),
      ...(this.pendingFinalRound ? { pendingFinalRound: true } : {}),
      ...(this.gameOver ? { gameOver: true } : {}),
      turnIndex: this.turnIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      players: this.players.map((player) => ({
        name: player.name,
        score: player.score,
        ...(Number(player.marketplacePurchaseCount) > 0 ? {
          marketplacePurchaseCount: Math.max(0, Number(player.marketplacePurchaseCount || 0))
        } : {}),
        rack: player.rack.map((tile) => this.serializeTile(tile))
      })),
      lettersAvailable: { ...this.lettersAvailable },
      ...(this.flashActivePlacements ? { flashActivePlacements: true } : {}),
      ...(this.discardedTiles.length > 0 ? {
        discardedTiles: this.discardedTiles.map((tile) => this.serializeTile(tile))
      } : {}),
      ...(this.boardTiles.size > 0 ? {
        boardTiles: this.mapToTileArray(this.boardTiles).map((tile) => this.serializeBoardTile(tile))
      } : {}),
      ...(this.boardBonuses.size > 0 ? {
        boardBonuses: Array.from(this.boardBonuses.entries())
          .map(([cellKey, bonus]) => this.serializeBonus(bonus, cellKey))
      } : {}),
      ...(this.marketplaceTiles.length > 0 ? {
        marketplaceTiles: this.marketplaceTiles.filter(Boolean).map((tile) => this.serializeTile(tile))
      } : {}),
      ...(this.activePlacements.size > 0 ? {
        activePlacements: this.mapToTileArray(this.activePlacements).map((tile) => this.serializeTile(tile))
      } : {})
    };
  }

  getRackTileSignatureCounts(rack) {
    return (rack || []).reduce((counts, tile) => {
      const signature = this.getRackTileSignature(tile);

      counts.set(signature, (counts.get(signature) || 0) + 1);
      return counts;
    }, new Map());
  }

  rackTileSetsMatch(firstRack, secondRack) {
    const firstCounts = this.getRackTileSignatureCounts(firstRack);
    const secondCounts = this.getRackTileSignatureCounts(secondRack);

    if (firstCounts.size !== secondCounts.size) {
      return false;
    }

    return Array.from(firstCounts.entries())
      .every(([signature, count]) => secondCounts.get(signature) === count);
  }

  getRackTileSignature(tile) {
    return [
      String(tile?.letter || "").toUpperCase(),
      tile?.wildcard ? "wild" : "letter",
      tile?.rainbow && !tile?.wildcard ? "rainbow" : "plain",
      String(tile?.sourceLetter || "").toUpperCase()
    ].join("|");
  }

  takeMatchingRackTile(availableTiles, preferredTile) {
    const preferredSignature = this.getRackTileSignature(preferredTile);
    let matchIndex = availableTiles.findIndex((tile) => (
      this.getRackTileSignature(tile) === preferredSignature
    ));

    if (matchIndex === -1) {
      const preferredLetter = String(preferredTile?.letter || "").toUpperCase();

      matchIndex = availableTiles.findIndex((tile) => (
        String(tile?.letter || "").toUpperCase() === preferredLetter
      ));
    }

    if (matchIndex === -1) {
      return null;
    }

    return availableTiles.splice(matchIndex, 1)[0];
  }

  preserveRackOrderIfTileSetMatches(serverRack, previousRack) {
    if (!this.rackTileSetsMatch(serverRack, previousRack)) {
      return serverRack;
    }

    const availableTiles = [...serverRack];
    const orderedRack = previousRack
      .map((tile) => this.takeMatchingRackTile(availableTiles, tile))
      .filter(Boolean);

    return orderedRack.length === serverRack.length
      ? orderedRack
      : serverRack;
  }

  loadFromJSON(gameStateJSON, options = {}) {
    const source = typeof gameStateJSON === "string"
      ? JSON.parse(gameStateJSON)
      : gameStateJSON;

    if (!source || typeof source !== "object") {
      throw new Error("Game state must be a JSON object.");
    }

    if (source.version !== 1) {
      throw new Error("Game state version must be 1.");
    }

    const preserveRackOrder = options.preserveRackOrder !== false;
    const previousRackByPlayerName = preserveRackOrder
      ? new Map((this.players || []).map((player) => [
        normalizeNameKey(player.name),
        player.rack || []
      ]))
      : new Map();

    this.letterFrequencies = { ...letter_freq };
    this.letterPoints = { ...letter_points };
    this.startingLettersAvailable = { ...letters_available };
    this.lettersAvailable = { ...this.startingLettersAvailable, ...source.lettersAvailable };
    this.nextTileId = 1;

    const hydrateTile = (tile) => {
      const letter = String(tile.letter || "").toUpperCase();
      const wildcard = Boolean(tile.wildcard) || letter === wildcardLetter;

      if (!letter) {
        throw new Error("Tiles must include a letter.");
      }

      return {
        id: `tile-${this.nextTileId++}`,
        letter,
        points: wildcard ? 0 : this.letterPoints[letter],
        frequency: wildcard ? this.letterFrequencies[wildcardLetter] : this.letterFrequencies[letter],
        ...(wildcard ? { wildcard: true } : {}),
        ...(!wildcard && tile.rainbow ? { rainbow: true } : {}),
        ...(tile.sourceLetter ? { sourceLetter: String(tile.sourceLetter).toUpperCase() } : {}),
        ...(tile.pendingMarketplace ? { pendingMarketplace: true } : {}),
        ...(Number.isInteger(Number(tile.marketplaceIndex)) ? { marketplaceIndex: Number(tile.marketplaceIndex) } : {}),
        ...(Number.isFinite(Number(tile.marketplaceCost)) ? { marketplaceCost: Number(tile.marketplaceCost) } : {}),
        ...(Number.isInteger(Number(tile.row)) ? { row: Number(tile.row) } : {}),
        ...(Number.isInteger(Number(tile.column)) ? { column: Number(tile.column) } : {})
      };
    };
    const hydrateTileMap = (tiles, active) => {
      const tileMap = new Map();

      (tiles || []).forEach((tile) => {
        const hydratedStack = active
          ? []
          : (Array.isArray(tile.stack) ? tile.stack : [])
            .map(hydrateTile);
        const hydratedTile = {
          ...hydrateTile(tile),
          active,
          ...(!active ? { stack: hydratedStack } : {})
        };

        if (!Number.isInteger(hydratedTile.row) || !Number.isInteger(hydratedTile.column)) {
          throw new Error("Board tiles must include integer row and column values.");
        }

        if (!active) {
          if (hydratedTile.stack.length === 0) {
            hydratedTile.stack = [{
              id: hydratedTile.id,
              letter: hydratedTile.letter,
              points: hydratedTile.points,
              frequency: hydratedTile.frequency,
              ...(hydratedTile.wildcard ? { wildcard: true } : {}),
              ...(hydratedTile.rainbow && !hydratedTile.wildcard ? { rainbow: true } : {}),
              ...(hydratedTile.sourceLetter ? { sourceLetter: hydratedTile.sourceLetter } : {}),
              row: hydratedTile.row,
              column: hydratedTile.column,
              active: false
            }];
          }

          const topTile = hydratedTile.stack[hydratedTile.stack.length - 1];
          hydratedTile.letter = topTile.letter;
          hydratedTile.points = topTile.points;
          hydratedTile.frequency = topTile.frequency;
          hydratedTile.wildcard = Boolean(topTile.wildcard);
          hydratedTile.rainbow = Boolean(topTile.rainbow) && !hydratedTile.wildcard;
          hydratedTile.sourceLetter = topTile.sourceLetter;
        }

        tileMap.set(this.getCellKey(hydratedTile.row, hydratedTile.column), hydratedTile);
      });

      return tileMap;
    };

    this.id = String(source.id || "").toUpperCase();
    this.startDate = String(source.startDate || "");
    this.lastPlayDate = String(source.lastPlayDate || this.startDate);
    this.gameLength = gameLengthSettings[source.gameLength] ? source.gameLength : "medium";
    this.tilesDrawn = Number.isInteger(Number(source.tilesDrawn))
      ? Math.max(0, Number(source.tilesDrawn))
      : Math.max(0, this.totalTilePool - this.tilesRemaining);
    this.finalTurnsRemaining = Number.isInteger(Number(source.finalTurnsRemaining))
      ? Math.max(0, Number(source.finalTurnsRemaining))
      : null;
    this.pendingFinalRound = Boolean(source.pendingFinalRound);
    this.gameOver = Boolean(source.gameOver);
    this.turnIndex = Number.isInteger(Number(source.turnIndex)) ? Math.max(0, Number(source.turnIndex)) : 0;
    this.players = (source.players || []).map((player) => {
      const name = String(player.name || "Player");
      const hydratedRack = (player.rack || []).map(hydrateTile);
      const previousRack = previousRackByPlayerName.get(normalizeNameKey(name));

      return {
        name,
        score: Number(player.score || 0),
        marketplacePurchaseCount: Math.max(0, Number(player.marketplacePurchaseCount || 0)),
        rack: previousRack
          ? this.preserveRackOrderIfTileSetMatches(hydratedRack, previousRack)
          : hydratedRack
      };
    });

    if (!/^[A-Z0-9]{5}$/.test(this.id)) {
      throw new Error("Game state must include a 5 character ID.");
    }

    if (!this.startDate) {
      throw new Error("Game state must include a start date.");
    }

    if (this.players.length === 0) {
      throw new Error("Game state must include at least one player.");
    }

    const loadedPlayerIndex = Number(source.currentPlayerIndex);
    this.currentPlayerIndex = Number.isInteger(loadedPlayerIndex)
      ? Math.max(0, Math.min(loadedPlayerIndex, this.players.length - 1))
      : 0;
    this.discardedTiles = (source.discardedTiles || []).map(hydrateTile);
    this.boardTiles = hydrateTileMap(source.boardTiles, false);
    this.pendingMarketplacePurchaseTileIds = new Set();
    this.pendingMarketplacePurchasePlayerIndex = null;
    this.pendingMarketplacePurchaseCountStart = null;
    this.pendingMarketplacePurchaseScoreStart = null;
    this.boardBonuses = new Map();
    (source.boardBonuses || []).forEach((bonus) => {
      const row = Number(bonus.row);
      const column = Number(bonus.column);
      const type = String(bonus.type || "") === "singleLetter"
        ? "doubleLetter"
        : String(bonus.type || "");

      if (
        Number.isInteger(row) &&
        Number.isInteger(column) &&
        row >= 0 &&
        row < boardSize &&
        column >= 0 &&
        column < boardSize &&
        bonusTypes[type]
      ) {
        this.boardBonuses.set(this.getCellKey(row, column), { type });
      }
    });
    this.marketplaceTiles = (source.marketplaceTiles || []).map((tile) => {
      const hydratedTile = hydrateTile(tile);
      const sourceLetter = String(hydratedTile.sourceLetter || hydratedTile.letter || "").toUpperCase();
      const marketLetter = playableLetters.includes(sourceLetter)
        ? sourceLetter
        : playableLetters.includes(hydratedTile.letter) ? hydratedTile.letter : "E";

      return {
        id: hydratedTile.id,
        letter: marketLetter,
        points: this.letterPoints[marketLetter],
        frequency: this.letterFrequencies[marketLetter]
      };
    });

    if (!Array.isArray(source.marketplaceTiles)) {
      this.drawMarketplaceTiles();
    }

    this.activePlacements = hydrateTileMap(source.activePlacements, true);
    this.flashActivePlacements = Boolean(source.flashActivePlacements);

    return this;
  }

  normalizeWord(word) {
    return String(word || "").trim().toUpperCase();
  }

  isRealWord(word) {
    const normalizedWord = this.normalizeWord(word);

    return normalizedWord.length > 0 && this.dictionary.has(normalizedWord);
  }

  isUnresolvedWildcard(tile) {
    return Boolean(tile?.wildcard) && tile.letter === wildcardLetter;
  }

  getCellKey(row, column) {
    return `${row},${column}`;
  }

  getTileAt(row, column) {
    const cellKey = this.getCellKey(row, column);

    const activeTile = this.activePlacements.get(cellKey);
    const boardTile = this.boardTiles.get(cellKey);

    return activeTile || this.getTopStackTile(boardTile) || null;
  }

  hasActivePlacements() {
    return this.activePlacements.size > 0;
  }

  isCellOccupied(row, column) {
    return Boolean(this.getTileAt(row, column));
  }

  hasBoardTiles() {
    return this.boardTiles.size > 0;
  }

  isBoardFullyCovered() {
    return this.boardTiles.size >= boardSize * boardSize;
  }

  hasActivePlacementOnStartCell() {
    return Array.from(this.activePlacements.values()).some((tile) => (
      this.isStartCell(tile.row, tile.column)
    ));
  }

  hasActivePlacementConnectedToBoard() {
    return Array.from(this.activePlacements.values()).some((tile) => {
      if (this.boardTiles.has(this.getCellKey(tile.row, tile.column))) {
        return true;
      }

      return [
        [tile.row - 1, tile.column],
        [tile.row + 1, tile.column],
        [tile.row, tile.column - 1],
        [tile.row, tile.column + 1]
      ].some(([row, column]) => this.boardTiles.has(this.getCellKey(row, column)));
    });
  }

  getActivePlacementLine(candidateRow = null, candidateColumn = null) {
    const activeTiles = Array.from(this.activePlacements.values());

    if (activeTiles.length === 0) {
      return null;
    }

    if (activeTiles.length === 1) {
      const [activeTile] = activeTiles;

      if (candidateRow === null || candidateColumn === null) {
        return null;
      }

      if (activeTile.row === candidateRow) {
        return {
          direction: "row",
          value: activeTile.row
        };
      }

      if (activeTile.column === candidateColumn) {
        return {
          direction: "column",
          value: activeTile.column
        };
      }

      return null;
    }

    const rows = new Set(activeTiles.map((tile) => tile.row));
    const columns = new Set(activeTiles.map((tile) => tile.column));

    if (rows.size === 1) {
      return {
        direction: "row",
        value: activeTiles[0].row
      };
    }

    if (columns.size === 1) {
      return {
        direction: "column",
        value: activeTiles[0].column
      };
    }

    return null;
  }

  isInPlacementLine(row, column, line) {
    return line.direction === "row"
      ? row === line.value
      : column === line.value;
  }

  getActivePlacementLineWithCandidate(candidateRow, candidateColumn, movingTileId = null) {
    const activeTiles = Array.from(this.activePlacements.values());
    const relevantTiles = movingTileId
      ? activeTiles.filter((tile) => tile.id !== movingTileId)
      : activeTiles;
    const rows = new Set([...relevantTiles.map((tile) => tile.row), candidateRow]);
    const columns = new Set([...relevantTiles.map((tile) => tile.column), candidateColumn]);

    if (rows.size === 1) {
      return {
        direction: "row",
        value: candidateRow
      };
    }

    if (columns.size === 1) {
      return {
        direction: "column",
        value: candidateColumn
      };
    }

    return null;
  }

  hasContiguousPlacementLine(line) {
    const activeTiles = Array.from(this.activePlacements.values());
    const positions = activeTiles.map((tile) => (
      line.direction === "row" ? tile.column : tile.row
    ));
    const minPosition = Math.min(...positions);
    const maxPosition = Math.max(...positions);

    for (let position = minPosition; position <= maxPosition; position += 1) {
      const row = line.direction === "row" ? line.value : position;
      const column = line.direction === "row" ? position : line.value;

      if (!this.isCellOccupied(row, column)) {
        return false;
      }
    }

    return true;
  }

  canPlaceTile(tileId, row, column, source = "rack") {
    const normalizedRow = Number(row);
    const normalizedColumn = Number(column);
    const movingActiveTile = source === "board"
      ? this.findActiveTileById(tileId)
      : null;

    if (source === "rack" && !this.currentRack.some((tile) => tile.id === tileId)) {
      return false;
    }

    if (source === "board" && !movingActiveTile) {
      return false;
    }

    if (source === "marketplace" && !this.canBuyTile(tileId)) {
      return false;
    }

    if (
      !Number.isInteger(normalizedRow) ||
      !Number.isInteger(normalizedColumn) ||
      normalizedRow < 0 ||
      normalizedRow >= boardSize ||
      normalizedColumn < 0 ||
      normalizedColumn >= boardSize
    ) {
      return false;
    }

    if (!this.hasActivePlacements()) {
      return true;
    }

    const activeLine = this.getActivePlacementLineWithCandidate(
      normalizedRow,
      normalizedColumn,
      source === "board" ? tileId : null
    );

    if (
      !activeLine ||
      !this.isInPlacementLine(normalizedRow, normalizedColumn, activeLine)
    ) {
      return false;
    }

    return true;
  }

  canPlaceRackTile(tileId, row, column) {
    return this.canPlaceTile(tileId, row, column, "rack");
  }

  canMoveMarketplaceTileToRack(tileId) {
    return this.canBuyTile(tileId);
  }

  findActiveTileById(tileId) {
    return Array.from(this.activePlacements.values()).find((tile) => tile.id === tileId) || null;
  }

  findActiveTileKeyById(tileId) {
    for (const [cellKey, tile] of this.activePlacements.entries()) {
      if (tile.id === tileId) {
        return cellKey;
      }
    }

    return null;
  }

  getRackTileFromActiveTile(tile) {
    return {
      id: tile.id,
      letter: tile.letter,
      points: tile.points,
      frequency: tile.frequency,
      ...(tile.wildcard ? { wildcard: true } : {}),
      ...(tile.rainbow && !tile.wildcard ? { rainbow: true } : {}),
      ...(tile.sourceLetter ? { sourceLetter: tile.sourceLetter } : {}),
      ...(tile.pendingMarketplace ? { pendingMarketplace: true } : {}),
      ...(Number.isInteger(tile.marketplaceIndex) ? { marketplaceIndex: tile.marketplaceIndex } : {}),
      ...(Number.isFinite(tile.marketplaceCost) ? { marketplaceCost: tile.marketplaceCost } : {})
    };
  }

  returnCoveredActiveTileToRack(cellKey) {
    const coveredTile = this.activePlacements.get(cellKey);

    if (!coveredTile) {
      return;
    }

    this.activePlacements.delete(cellKey);
    this.currentRack.push(this.getRackTileFromActiveTile(coveredTile));
  }

  placeRackTile(tileId, row, column) {
    const normalizedRow = Number(row);
    const normalizedColumn = Number(column);

    if (!this.canPlaceRackTile(tileId, normalizedRow, normalizedColumn)) {
      return false;
    }

    const rackIndex = this.currentRack.findIndex((tile) => tile.id === tileId);
    const [tile] = this.currentRack.splice(rackIndex, 1);
    const cellKey = this.getCellKey(normalizedRow, normalizedColumn);

    this.returnCoveredActiveTileToRack(cellKey);
    this.activePlacements.set(cellKey, {
      ...tile,
      row: normalizedRow,
      column: normalizedColumn,
      active: true
    });
    this.flashActivePlacements = false;

    return true;
  }

  placeMarketplaceTile(tileId, row, column) {
    const normalizedRow = Number(row);
    const normalizedColumn = Number(column);

    if (!this.canPlaceTile(tileId, normalizedRow, normalizedColumn, "marketplace")) {
      return false;
    }

    const tile = this.buyMarketplaceTile(tileId);

    if (!tile) {
      return false;
    }

    const cellKey = this.getCellKey(normalizedRow, normalizedColumn);

    this.returnCoveredActiveTileToRack(cellKey);
    this.activePlacements.set(cellKey, {
      ...tile,
      row: normalizedRow,
      column: normalizedColumn,
      active: true
    });
    this.flashActivePlacements = false;

    return true;
  }

  moveActiveTile(tileId, row, column) {
    const normalizedRow = Number(row);
    const normalizedColumn = Number(column);

    if (!this.canPlaceTile(tileId, normalizedRow, normalizedColumn, "board")) {
      return false;
    }

    const existingKey = this.findActiveTileKeyById(tileId);
    const tile = this.activePlacements.get(existingKey);
    const targetKey = this.getCellKey(normalizedRow, normalizedColumn);

    this.activePlacements.delete(existingKey);
    this.returnCoveredActiveTileToRack(targetKey);
    this.activePlacements.set(targetKey, {
      ...tile,
      row: normalizedRow,
      column: normalizedColumn,
      active: true
    });
    this.flashActivePlacements = false;

    return true;
  }

  moveActiveTileToRack(tileId, targetIndex = this.currentRack.length) {
    const existingKey = this.findActiveTileKeyById(tileId);

    if (!existingKey) {
      return false;
    }

    const tile = this.activePlacements.get(existingKey);
    const normalizedTargetIndex = Math.max(0, Math.min(Number(targetIndex), this.currentRack.length));

    this.activePlacements.delete(existingKey);
    this.currentRack.splice(normalizedTargetIndex, 0, this.getRackTileFromActiveTile(tile));
    this.flashActivePlacements = false;

    return true;
  }

  moveRackTile(tileId, targetIndex) {
    const sourceIndex = this.currentRack.findIndex((tile) => tile.id === tileId);

    if (sourceIndex === -1) {
      return false;
    }

    const [tile] = this.currentRack.splice(sourceIndex, 1);
    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const normalizedTargetIndex = Math.max(0, Math.min(Number(adjustedTargetIndex), this.currentRack.length));

    this.currentRack.splice(normalizedTargetIndex, 0, tile);
    return true;
  }

  shuffleCurrentRack() {
    if (this.currentRack.length < 2) {
      return false;
    }

    const originalTileIds = this.currentRack.map((tile) => tile.id);
    const lodashShuffle = globalThis._?.shuffle;
    let shuffledRack = this.currentRack;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      shuffledRack = typeof lodashShuffle === "function"
        ? lodashShuffle(this.currentRack)
        : this.currentRack
          .map((tile) => ({ tile, sort: Math.random() }))
          .sort((first, second) => first.sort - second.sort)
          .map(({ tile }) => tile);

      if (shuffledRack.some((tile, index) => tile.id !== originalTileIds[index])) {
        break;
      }
    }

    this.currentRack = shuffledRack;
    return true;
  }

  moveMarketplaceTileToRack(tileId, targetIndex = this.currentRack.length) {
    if (!this.canMoveMarketplaceTileToRack(tileId)) {
      return false;
    }

    const tile = this.buyMarketplaceTile(tileId);

    if (!tile) {
      return false;
    }

    const normalizedTargetIndex = Math.max(0, Math.min(Number(targetIndex), this.currentRack.length));

    this.currentRack.splice(normalizedTargetIndex, 0, tile);
    return true;
  }

  resetActivePlacements() {
    Array.from(this.activePlacements.values()).forEach((tile) => {
      if (tile.pendingMarketplace) {
        this.returnPendingMarketplaceTile(tile);
        return;
      }

      this.currentRack.push({
        id: tile.id,
        letter: tile.letter,
        points: tile.points,
        frequency: tile.frequency,
        ...(tile.wildcard ? { wildcard: true } : {}),
        ...(tile.rainbow && !tile.wildcard ? { rainbow: true } : {}),
        ...(tile.sourceLetter ? { sourceLetter: tile.sourceLetter } : {})
      });
    });
    this.activePlacements.clear();
    this.resetMarketplacePurchases();
  }

  getVisibleBoardTileAt(row, column) {
    return this.getTopStackTile(this.boardTiles.get(this.getCellKey(row, column))) || null;
  }

  getBoardWords(options = {}) {
    return this.getBoardWordTiles(options).map((tiles) => tiles.map((tile) => tile.letter).join(""));
  }

  getBoardWordTiles(options = {}) {
    const includeActivePlacements = options.includeActivePlacements !== false;
    const wordTiles = [];
    const collectWord = (tiles) => {
      if (tiles.length > 1) {
        wordTiles.push(tiles);
      }
    };
    const getWordTileAt = (row, column) => (
      includeActivePlacements
        ? this.getTileAt(row, column)
        : this.getVisibleBoardTileAt(row, column)
    );

    for (let row = 0; row < boardSize; row += 1) {
      let currentWordTiles = [];

      for (let column = 0; column < boardSize; column += 1) {
        const tile = getWordTileAt(row, column);

        if (tile) {
          currentWordTiles.push(tile);
        } else {
          collectWord(currentWordTiles);
          currentWordTiles = [];
        }
      }

      collectWord(currentWordTiles);
    }

    for (let column = 0; column < boardSize; column += 1) {
      let currentWordTiles = [];

      for (let row = 0; row < boardSize; row += 1) {
        const tile = getWordTileAt(row, column);

        if (tile) {
          currentWordTiles.push(tile);
        } else {
          collectWord(currentWordTiles);
          currentWordTiles = [];
        }
      }

      collectWord(currentWordTiles);
    }

    return wordTiles;
  }

  validateStackingLeavesCoveredWordsVisible() {
    const activeCellKeys = new Set(this.activePlacements.keys());
    const coveredWords = this.getBoardWordTiles({ includeActivePlacements: false })
      .filter((tiles) => (
        tiles.some((tile) => activeCellKeys.has(this.getCellKey(tile.row, tile.column))) &&
        tiles.every((tile) => activeCellKeys.has(this.getCellKey(tile.row, tile.column)))
      ));

    return {
      isValid: coveredWords.length === 0,
      placementError: coveredWords.length === 0
        ? ""
        : "At least one tile of each stacked-on word must remain visible this turn."
    };
  }

  getDictionaryWordsByLength(length) {
    if (!this.dictionaryWordsByLength) {
      this.dictionaryWordsByLength = new Map();

      this.dictionary.forEach((word) => {
        const normalizedWord = this.normalizeWord(word);

        if (!normalizedWord || /[^A-Z]/.test(normalizedWord)) {
          return;
        }

        if (!this.dictionaryWordsByLength.has(normalizedWord.length)) {
          this.dictionaryWordsByLength.set(normalizedWord.length, []);
        }

        this.dictionaryWordsByLength.get(normalizedWord.length).push(normalizedWord);
      });
    }

    return this.dictionaryWordsByLength.get(length) || [];
  }

  canAssignWildcardLetter(tile, letter) {
    const assignedLetter = String(letter || "").toUpperCase();

    if (!this.isUnresolvedWildcard(tile) || !playableLetters.includes(assignedLetter)) {
      return false;
    }

    const boardTile = this.boardTiles.get(this.getCellKey(tile.row, tile.column));
    const coveredTile = this.getTopStackTile(boardTile);

    return !coveredTile || coveredTile.letter !== assignedLetter;
  }

  getWildcardResolution() {
    const wildcardTiles = Array.from(this.activePlacements.values())
      .filter((tile) => this.isUnresolvedWildcard(tile));

    if (wildcardTiles.length === 0) {
      return {
        isValid: true,
        assignments: new Map()
      };
    }

    const wildcardIds = new Set(wildcardTiles.map((tile) => tile.id));
    const constraints = this.getBoardWordTiles()
      .filter((tiles) => tiles.some((tile) => wildcardIds.has(tile.id)))
      .map((tiles) => {
        const candidates = this.getDictionaryWordsByLength(tiles.length)
          .filter((word) => tiles.every((tile, index) => (
            this.isUnresolvedWildcard(tile)
              ? this.canAssignWildcardLetter(tile, word[index])
              : tile.letter === word[index]
          )));

        return {
          tiles,
          candidates
        };
      });

    if (constraints.some((constraint) => constraint.candidates.length === 0)) {
      return {
        isValid: false,
        assignments: new Map()
      };
    }

    constraints.sort((first, second) => first.candidates.length - second.candidates.length);

    const solve = (constraintIndex, assignments) => {
      if (constraintIndex >= constraints.length) {
        return assignments;
      }

      const constraint = constraints[constraintIndex];

      for (const candidate of constraint.candidates) {
        const nextAssignments = new Map(assignments);
        let canUseCandidate = true;

        constraint.tiles.forEach((tile, index) => {
          if (!canUseCandidate || !wildcardIds.has(tile.id)) {
            return;
          }

          const assignedLetter = nextAssignments.get(tile.id);
          const candidateLetter = candidate[index];

          if (!this.canAssignWildcardLetter(tile, candidateLetter)) {
            canUseCandidate = false;
            return;
          }

          if (assignedLetter && assignedLetter !== candidateLetter) {
            canUseCandidate = false;
            return;
          }

          nextAssignments.set(tile.id, candidateLetter);
        });

        if (!canUseCandidate) {
          continue;
        }

        const result = solve(constraintIndex + 1, nextAssignments);

        if (result) {
          return result;
        }
      }

      return null;
    };

    const assignments = solve(0, new Map());

    if (assignments) {
      wildcardTiles.forEach((tile) => {
        if (!assignments.has(tile.id)) {
          const defaultLetter = playableLetters.find((letter) => this.canAssignWildcardLetter(tile, letter));

          if (defaultLetter) {
            assignments.set(tile.id, defaultLetter);
          }
        }
      });
    }

    return {
      isValid: Boolean(assignments),
      assignments: assignments || new Map()
    };
  }

  resolveActiveWildcards(assignments) {
    assignments.forEach((letter, tileId) => {
      const tile = this.findActiveTileById(tileId);

      if (tile && this.isUnresolvedWildcard(tile) && playableLetters.includes(letter)) {
        tile.letter = letter;
        tile.points = 0;
        tile.wildcard = true;
      }
    });
  }

  getWordAt(row, column, direction, assignments = new Map()) {
    const rowStep = direction === "column" ? 1 : 0;
    const columnStep = direction === "row" ? 1 : 0;
    let startRow = row;
    let startColumn = column;

    while (
      startRow - rowStep >= 0 &&
      startColumn - columnStep >= 0 &&
      this.getTileAt(startRow - rowStep, startColumn - columnStep)
    ) {
      startRow -= rowStep;
      startColumn -= columnStep;
    }

    const tiles = [];
    let currentRow = startRow;
    let currentColumn = startColumn;

    while (
      currentRow < boardSize &&
      currentColumn < boardSize &&
      this.getTileAt(currentRow, currentColumn)
    ) {
      tiles.push(this.getTileAt(currentRow, currentColumn));
      currentRow += rowStep;
      currentColumn += columnStep;
    }

    return {
      direction,
      key: `${direction}:${startRow},${startColumn}`,
      tiles,
      score: this.scoreWordTiles(tiles),
      word: tiles.map((tile) => assignments.get(tile.id) || tile.letter).join("")
    };
  }

  scoreWordTiles(tiles) {
    let wordMultiplier = 1;
    const letterScore = tiles.reduce((total, tile) => {
      const cellKey = this.getCellKey(tile.row, tile.column);
      const boardTile = this.boardTiles.get(cellKey);
      const boardStackLength = this.getTileStack(boardTile).length;
      const stackMultiplier = tile.active
        ? boardStackLength + 1
        : Math.max(1, boardStackLength);
      const bonus = tile.active && !boardTile
        ? this.getBonusAt(tile.row, tile.column)
        : null;
      const bonusType = bonus ? bonusTypes[bonus.type] : null;

      if (bonusType?.scope === "word") {
        wordMultiplier *= bonusType.multiplier;
      }

      if (tile.rainbow && !tile.wildcard) {
        wordMultiplier *= 2;
      }

      return total + (
        tile.points *
        stackMultiplier *
        (bonusType?.scope === "letter" ? bonusType.multiplier : 1)
      );
    }, 0);

    return letterScore * wordMultiplier;
  }

  getChangedWords(assignments = new Map(), options = {}) {
    const changedWords = new Map();

    this.activePlacements.forEach((tile) => {
      ["row", "column"].forEach((direction) => {
        const word = this.getWordAt(tile.row, tile.column, direction, assignments);

        if (word.word.length > 1) {
          changedWords.set(word.key, word);
        }
      });
    });

    if (options.includeSingleFallback && changedWords.size === 0 && this.activePlacements.size === 1) {
      const [tile] = Array.from(this.activePlacements.values());

      changedWords.set(`single:${tile.row},${tile.column}`, {
        direction: "single",
        key: `single:${tile.row},${tile.column}`,
        tiles: [tile],
        score: this.scoreWordTiles([tile]),
        word: assignments.get(tile.id) || tile.letter
      });
    }

    return Array.from(changedWords.values());
  }

  getCurrentTurnScore() {
    return this.getChangedWords(new Map(), { includeSingleFallback: true })
      .reduce((total, word) => total + word.score, 0);
  }

  validateBoardWords() {
    const words = this.getBoardWords();
    const invalidWords = words.filter((word) => !this.isRealWord(word));

    return {
      isValid: invalidWords.length === 0,
      words,
      invalidWords
    };
  }

  validateBoardWordsWithWildcardAssignments(assignments) {
    const words = this.getBoardWordTiles().map((tiles) => (
      tiles.map((tile) => assignments.get(tile.id) || tile.letter).join("")
    ));
    const invalidWords = words.filter((word) => !this.isRealWord(word));

    return {
      isValid: invalidWords.length === 0,
      words,
      invalidWords
    };
  }

  validateChangedWordsWithWildcardAssignments(assignments) {
    const words = this.getChangedWords(assignments, { includeSingleFallback: true })
      .map((word) => word.word);
    const invalidWords = words.filter((word) => !this.isRealWord(word));

    return {
      isValid: words.length > 0 && invalidWords.length === 0,
      words,
      invalidWords,
      placementError: words.length > 0 ? "" : "Placed tiles must make a real word."
    };
  }

  validateStartAndConnectionRules(assignments) {
    const changedWords = this.getChangedWords(assignments);

    if (!this.hasBoardTiles()) {
      if (!this.hasActivePlacementOnStartCell()) {
        return {
          isValid: false,
          placementError: "The first word must cover the START square."
        };
      }

      if (!changedWords.some((word) => (
        word.word.length >= 2 &&
        word.tiles.some((tile) => this.isStartCell(tile.row, tile.column))
      ))) {
        return {
          isValid: false,
          placementError: "The first play must make a word of at least two letters through START."
        };
      }

      return {
        isValid: true
      };
    }

    if (!this.hasActivePlacementConnectedToBoard()) {
      return {
        isValid: false,
        placementError: "Every play after the first must connect to existing tiles."
      };
    }

    return {
      isValid: true
    };
  }

  validateActivePlacementLine() {
    if (
      this.activePlacements.size > 0 &&
      !Array.from(this.activePlacements.keys()).some((cellKey) => !this.boardTiles.has(cellKey))
    ) {
      return {
        isValid: false,
        placementError: "Place at least one tile on an empty square."
      };
    }

    if (this.activePlacements.size < 2) {
      return {
        isValid: true
      };
    }

    const activeLine = this.getActivePlacementLine();
    const isValid = Boolean(activeLine) && this.hasContiguousPlacementLine(activeLine);

    return {
      isValid,
      placementError: isValid ? "" : "Tiles must be in one connected row or column."
    };
  }

  finishActivePlacements() {
    const placementValidation = this.validateActivePlacementLine();

    if (!placementValidation.isValid) {
      this.flashActivePlacements = true;
      return {
        ...placementValidation,
        words: [],
        invalidWords: []
      };
    }

    const stackingValidation = this.validateStackingLeavesCoveredWordsVisible();

    if (!stackingValidation.isValid) {
      this.flashActivePlacements = true;
      return {
        ...stackingValidation,
        words: [],
        invalidWords: []
      };
    }

    const wildcardResolution = this.getWildcardResolution();

    if (!wildcardResolution.isValid) {
      this.flashActivePlacements = true;
      return {
        isValid: false,
        words: this.getBoardWords(),
        invalidWords: this.getBoardWords().filter((word) => word.includes(wildcardLetter)),
        placementError: "Wild tiles could not make valid words."
      };
    }

    const startConnectionValidation = this.validateStartAndConnectionRules(wildcardResolution.assignments);

    if (!startConnectionValidation.isValid) {
      this.flashActivePlacements = true;
      return {
        ...startConnectionValidation,
        words: [],
        invalidWords: []
      };
    }

    const turnValidation = this.validateChangedWordsWithWildcardAssignments(wildcardResolution.assignments);

    if (!turnValidation.isValid) {
      this.flashActivePlacements = true;
      return turnValidation;
    }

    const validation = this.validateBoardWordsWithWildcardAssignments(wildcardResolution.assignments);

    if (!validation.isValid) {
      this.flashActivePlacements = true;
      return validation;
    }

    this.resolveActiveWildcards(wildcardResolution.assignments);

    const turnWords = this.getChangedWords(new Map(), { includeSingleFallback: true });
    const turnScore = this.getCurrentTurnScore();

    this.activePlacements.forEach((tile, cellKey) => {
      const existingBoardTile = this.boardTiles.get(cellKey);
      const stack = existingBoardTile
        ? this.getTileStack(existingBoardTile).map((stackTile) => ({ ...stackTile }))
        : [];
      const cleanTile = tile.pendingMarketplace
        ? this.stripPendingMarketplaceTile(tile)
        : tile;
      const committedTile = {
        id: cleanTile.id,
        letter: cleanTile.letter,
        points: cleanTile.points,
        frequency: cleanTile.frequency,
        ...(cleanTile.wildcard ? { wildcard: true } : {}),
        ...(cleanTile.rainbow && !cleanTile.wildcard ? { rainbow: true } : {}),
        ...(cleanTile.sourceLetter ? { sourceLetter: cleanTile.sourceLetter } : {}),
        row: cleanTile.row,
        column: cleanTile.column,
        active: false
      };

      stack.push(committedTile);

      this.boardTiles.set(cellKey, {
        ...committedTile,
        stack
      });
    });
    this.activePlacements.clear();
    this.flashActivePlacements = false;
    this.currentScore += turnScore;

    if (this.isBoardFullyCovered()) {
      this.gameOver = true;
      this.pendingFinalRound = false;
      this.finalTurnsRemaining = null;

      return {
        ...validation,
        turnScore,
        turnWords
      };
    }

    const refillTileCount = Math.max(0, 7 - this.currentRack.length);
    const refillTiles = this.drawTiles(refillTileCount);

    if (this.gameLength === "long" && refillTiles.length < refillTileCount) {
      this.pendingFinalRound = true;
    }

    return {
      ...validation,
      turnScore,
      turnWords
    };
  }
}

const gameState = new WordWefterGameState();
const boardSize = 9;
const startCell = {
  row: Math.floor(boardSize / 2),
  column: Math.floor(boardSize / 2)
};
const serverURL = "./server.php";
const playerNameCookie = "wordwefterPlayerName";
const turnNotificationsKey = "wordwefterTurnNotifications";
const foregroundTurnPollMilliseconds = 3000;
const backgroundTurnPollMilliseconds = 120000;
let rackSortable = null;
let marketplaceSortable = null;
let boardSortables = [];
let pendingIdentityAction = null;
let turnPollTimer = null;
let turnPollTimerMilliseconds = 0;
let immediateTurnRefreshTimer = null;
let lastTurnNotificationKey = "";
let remotePlayedCellKeys = new Set();
let remotePlayedClearTimer = null;
let loadingGameFromURL = false;
let marketplaceRenderTimer = null;
let renderedRackTileIds = new Set();
let renderedMarketplaceTileIds = new Set();
let renderedGameId = "";
let turnStartGameStateJSON = "";
const tileEnterDurations = [520, 560, 540, 500];
const tileEnterYOffsets = ["0.45rem", "-0.4rem", "-0.55rem", "0.16rem"];
const tileEnterRotations = ["-10deg", "11deg", "-6deg", "5deg"];
let tileEnterQueueAvailableAt = 0;

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
    isWord: (word) => gameState.isRealWord(word)
  };

  globalThis.WordWefterGameState = WordWefterGameState;
  globalThis.wordWefterGame = gameState;
  globalThis.isWordWefterWord = testGlobals.isWord;
  globalThis.wordWefterTest = testGlobals;

  document.documentElement.dataset.wordWefterTestReady = "true";
  document.documentElement.dataset.wordWefterBoardSize = String(boardSize);
  document.documentElement.dataset.wordWefterStartCell = `${startCell.row},${startCell.column}`;
  document.documentElement.dataset.wordWefterWildcardLetter = wildcardLetter;
}

exposeWordWefterTestingGlobals();

function captureTurnStartGameState() {
  turnStartGameStateJSON = JSON.stringify(gameState.toJSON());
}

function restoreTurnStartGameState() {
  if (!turnStartGameStateJSON) {
    return false;
  }

  gameState.loadFromJSON(JSON.parse(turnStartGameStateJSON), { preserveRackOrder: false });
  remotePlayedCellKeys.clear();
  renderedRackTileIds = getTileIds(getVisibleRack());
  renderedMarketplaceTileIds = getTileIds(gameState.marketplaceTiles);
  renderedGameId = gameState.id;
  tileEnterQueueAvailableAt = 0;
  return true;
}

function createTileElement(tile, options = {}) {
  const tileElement = document.createElement("div");
  const letterElement = document.createElement("span");
  const pointsElement = document.createElement("span");

  tileElement.className = "tile";
  tileElement.dataset.tileId = tile.id;
  tileElement.dataset.tileSource = options.source || "rack";
  if (tile.pendingMarketplace) {
    tileElement.dataset.marketplacePending = "true";
    tileElement.classList.add("tile-marketplace-pending");
  }
  if (tile.letter === wildcardLetter) {
    letterElement.className = "material-symbols-outlined tile-wild-symbol";
    letterElement.textContent = "asterisk";
  } else {
    letterElement.textContent = tile.letter;
  }
  pointsElement.className = "tile-points";
  pointsElement.textContent = tile.points;

  if (tile.wildcard) {
    tileElement.classList.add("tile-wildcard");
    tileElement.title = tile.letter === wildcardLetter
      ? "Wild tile"
      : `Wild tile resolved as ${tile.letter}`;
  }

  if (tile.rainbow && !tile.wildcard) {
    tileElement.classList.add("tile-rainbow");
    tileElement.title = "Rainbow tile: doubles words containing it";
  }

  if (options.movable) {
    tileElement.classList.add("tile-movable");
  }

  if (tile.pendingMarketplace) {
    tileElement.addEventListener("dblclick", () => {
      if (gameState.returnPendingMarketplaceTileToMarketplace(tile.id)) {
        setGameMessage("");
        renderGame();
      }
    });
  } else if (options.source === "board" && options.active) {
    tileElement.addEventListener("dblclick", () => {
      if (gameState.moveActiveTileToRack(tile.id)) {
        setGameMessage("");
        renderGame();
      }
    });
  }

  if (options.active) {
    tileElement.classList.add("tile-active-placement");
  }

  if (options.covered) {
    tileElement.classList.add("tile-covered-underlay");
  }

  if (options.covering) {
    tileElement.classList.add("tile-covering-placement");
  }

  if (Number.isInteger(options.stackMultiplier) && options.stackMultiplier > 1) {
    const stackBadge = document.createElement("span");

    tileElement.classList.add("tile-stacked");
    stackBadge.className = "tile-stack-badge";
    stackBadge.textContent = `${options.stackMultiplier}x`;
    tileElement.append(stackBadge);
  }

  if (options.flash) {
    tileElement.classList.add("tile-placement-error");
  }

  if (options.remotePlayed) {
    tileElement.classList.add("tile-remote-play");
  }

  tileElement.append(letterElement, pointsElement);
  return tileElement;
}

function renderBoard() {
  const board = document.querySelector("#board");

  if (!board) {
    return;
  }

  board.replaceChildren();

  for (let index = 0; index < boardSize * boardSize; index += 1) {
    const cell = document.createElement("div");
    cell.className = "board-cell";
    cell.dataset.row = Math.floor(index / boardSize);
    cell.dataset.column = index % boardSize;

    const row = Number(cell.dataset.row);
    const column = Number(cell.dataset.column);
    const cellKey = gameState.getCellKey(row, column);
    const activeTile = gameState.activePlacements.get(cellKey);
    const boardTile = gameState.boardTiles.get(cellKey);
    const boardStack = gameState.getTileStack(boardTile);
    const topBoardTile = gameState.getTopStackTile(boardTile);
    const tile = activeTile || topBoardTile;
    const bonus = gameState.getBonusAt(row, column);

    if (gameState.isStartCell(row, column) && !boardTile && !activeTile) {
      const startElement = document.createElement("span");

      cell.classList.add("board-cell-start");
      startElement.className = "board-start-label";
      startElement.textContent = "start";
      cell.append(startElement);
    } else if (bonus && bonusTypes[bonus.type] && !boardTile) {
      const bonusType = bonusTypes[bonus.type];
      const bonusElement = document.createElement("span");
      const multiplierElement = document.createElement("span");
      const scopeElement = document.createElement("span");

      cell.classList.add("board-cell-bonus", `board-cell-bonus-${bonus.type}`);
      bonusElement.className = "board-bonus-label";
      multiplierElement.className = "board-bonus-multiplier";
      multiplierElement.textContent = `${bonusType.multiplier}x`;
      scopeElement.className = "board-bonus-scope";
      scopeElement.textContent = bonusType.scope;
      bonusElement.title = `${bonusType.multiplier}x ${bonusType.scope}`;
      bonusElement.append(multiplierElement, scopeElement);
      cell.append(bonusElement);
    }

    if (boardStack.length > 1 && !activeTile) {
      cell.append(createTileElement(boardStack[boardStack.length - 2], {
        covered: true,
        source: "board"
      }));
    }

    if (topBoardTile && activeTile) {
      cell.append(createTileElement(topBoardTile, {
        covered: true,
        stackMultiplier: boardStack.length,
        source: "board"
      }));
    }

    if (tile) {
      cell.append(createTileElement(tile, {
        active: tile.active,
        covering: Boolean(activeTile && topBoardTile) || Boolean(!activeTile && boardStack.length > 1),
        flash: tile.active && gameState.flashActivePlacements,
        movable: tile.active && isMyTurn(),
        remotePlayed: remotePlayedCellKeys.has(cellKey),
        stackMultiplier: activeTile && boardStack.length > 0
          ? boardStack.length + 1
          : boardStack.length,
        source: "board"
      }));
    }

    board.append(cell);
  }
}

function getRackTileRects() {
  return new Map(Array.from(document.querySelectorAll("#rack .tile"))
    .map((tileElement) => [tileElement.dataset.tileId, tileElement.getBoundingClientRect()]));
}

function animateRackShuffle(previousRects) {
  if (!previousRects) {
    return;
  }

  document.querySelectorAll("#rack .tile").forEach((tileElement, index) => {
    const previousRect = previousRects.get(tileElement.dataset.tileId);

    if (!previousRect) {
      return;
    }

    const nextRect = tileElement.getBoundingClientRect();
    const shiftX = previousRect.left - nextRect.left;
    const shiftY = previousRect.top - nextRect.top;

    if (Math.abs(shiftX) < 1 && Math.abs(shiftY) < 1) {
      return;
    }

    tileElement.style.setProperty("--shuffle-x", `${shiftX}px`);
    tileElement.style.setProperty("--shuffle-y", `${shiftY}px`);
    tileElement.style.setProperty("--shuffle-delay", `${Math.min(index * 22, 120)}ms`);
    tileElement.classList.add(`tile-shuffle-${(index % 4) + 1}`);
    window.setTimeout(() => {
      tileElement.classList.remove("tile-shuffle-1", "tile-shuffle-2", "tile-shuffle-3", "tile-shuffle-4");
      tileElement.style.removeProperty("--shuffle-x");
      tileElement.style.removeProperty("--shuffle-y");
      tileElement.style.removeProperty("--shuffle-delay");
    }, 620);
  });
}

function animateRackRedrawExit() {
  const exitMilliseconds = 1380;

  document.querySelectorAll("#rack .tile").forEach((tileElement, index) => {
    const tileRect = tileElement.getBoundingClientRect();
    const tileClone = tileElement.cloneNode(true);
    const fallX = index % 2 === 0
      ? -Math.max(90, tileRect.width * 1.4)
      : Math.max(90, tileRect.width * 1.4);

    tileClone.classList.remove("tile-movable");
    tileClone.classList.add(`tile-redraw-exit-${(index % 4) + 1}`);
    tileClone.style.setProperty("--redraw-fall-x", `${fallX}px`);
    tileClone.style.setProperty("--redraw-delay", `${Math.min(index * 24, 140)}ms`);
    tileClone.style.left = `${tileRect.left}px`;
    tileClone.style.top = `${tileRect.top}px`;
    tileClone.style.width = `${tileRect.width}px`;
    tileClone.style.height = `${tileRect.height}px`;
    document.body.append(tileClone);
    tileElement.style.visibility = "hidden";

    window.setTimeout(() => {
      tileClone.remove();
    }, exitMilliseconds);
  });

  return exitMilliseconds;
}

function animateRackRedrawEnter() {
  animateSequentialTileEnter(Array.from(document.querySelectorAll("#rack .tile")));
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function getTileIds(tiles) {
  return new Set((tiles || [])
    .filter(Boolean)
    .map((tile) => tile.id));
}

function getNewTileIds(nextTileIds, previousTileIds) {
  return new Set(Array.from(nextTileIds)
    .filter((tileId) => !previousTileIds.has(tileId)));
}

function animateSequentialTileEnter(tileElements) {
  const now = Date.now();
  let nextDelay = Math.max(0, tileEnterQueueAvailableAt - now);
  const lodashShuffle = globalThis._?.shuffle;
  const variantIndexes = tileElements.map((_, index) => index % tileEnterDurations.length);
  const shuffledVariantIndexes = typeof lodashShuffle === "function"
    ? lodashShuffle(variantIndexes)
    : variantIndexes.sort(() => Math.random() - 0.5);

  tileElements.forEach((tileElement, index) => {
    const variantIndex = shuffledVariantIndexes[index];
    const enterClass = `tile-enter-${variantIndex + 1}`;
    const enterY = tileEnterYOffsets[variantIndex];
    const duration = tileEnterDurations[variantIndex];

    tileElement.style.setProperty("--shuffle-x", "115%");
    tileElement.style.setProperty("--shuffle-y", enterY);
    tileElement.style.setProperty("--shuffle-delay", "0ms");
    tileElement.style.setProperty("--tile-enter-rotation", tileEnterRotations[variantIndex]);
    tileElement.classList.add("tile-enter-pending");
    window.setTimeout(() => {
      tileElement.classList.remove("tile-enter-pending");
      tileElement.classList.add(enterClass);
    }, nextDelay);
    window.setTimeout(() => {
      tileElement.classList.remove("tile-enter-1", "tile-enter-2", "tile-enter-3", "tile-enter-4");
      tileElement.style.removeProperty("--shuffle-x");
      tileElement.style.removeProperty("--shuffle-y");
      tileElement.style.removeProperty("--shuffle-delay");
      tileElement.style.removeProperty("--tile-enter-rotation");
    }, nextDelay + duration + 40);

    nextDelay += duration / 2;
  });

  tileEnterQueueAvailableAt = now + nextDelay;
}

function renderRack(options = {}) {
  const rack = document.querySelector("#rack");
  const visibleRack = getVisibleRack();
  const nextRackTileIds = getTileIds(visibleRack);
  const enteringTileIds = getNewTileIds(nextRackTileIds, renderedRackTileIds);

  if (!rack) {
    return;
  }

  rack.replaceChildren();

  visibleRack.forEach((tile) => {
    rack.append(createTileElement(tile, { movable: !gameState.gameOver, source: "rack" }));
  });

  animateRackShuffle(options.shuffleRects);

  const enteringTileElements = Array.from(rack.querySelectorAll(".tile"))
    .filter((tileElement) => enteringTileIds.has(tileElement.dataset.tileId));

  if (enteringTileElements.length > 0) {
    animateSequentialTileEnter(enteringTileElements);
  }

  renderedRackTileIds = nextRackTileIds;
}

function animateMarketplaceEnter() {
  animateSequentialTileEnter(Array.from(document.querySelectorAll("#marketplace .marketplace-item:not(.marketplace-item-empty)")));
}

function renderMarketplace(options = {}) {
  const marketplace = document.querySelector("#marketplace");
  const marketplaceCostBadge = document.querySelector(".marketplace-cost-badge");
  const marketplaceCostElement = document.querySelector("#marketplace-cost");
  const nextMarketplaceTileIds = getTileIds(gameState.marketplaceTiles);
  const enteringTileIds = options.enter
    ? nextMarketplaceTileIds
    : getNewTileIds(nextMarketplaceTileIds, renderedMarketplaceTileIds);

  if (!marketplace) {
    return;
  }

  window.clearTimeout(marketplaceRenderTimer);
  marketplaceRenderTimer = null;

  if (Number.isFinite(options.delayMs) && options.delayMs > 0) {
    marketplace.replaceChildren(...(marketplaceCostBadge ? [marketplaceCostBadge] : []));
    marketplaceRenderTimer = window.setTimeout(() => {
      renderMarketplace({
        enter: options.enter
      });
    }, options.delayMs);
    return;
  }

  if (marketplaceCostElement) {
    marketplaceCostElement.textContent = gameState.getMarketplaceTileCost();
  }

  marketplace.replaceChildren(...(marketplaceCostBadge ? [marketplaceCostBadge] : []));

  gameState.marketplaceTiles.forEach((tile) => {
    const itemElement = document.createElement("div");

    itemElement.className = "marketplace-item";
    if (!tile) {
      itemElement.classList.add("marketplace-item-empty");
      marketplace.append(itemElement);
      return;
    }

    const canBuy = isMyTurn() && !gameState.gameOver && gameState.canBuyTile(tile.id);

    itemElement.dataset.tileId = tile.id;
    itemElement.dataset.tileSource = "marketplace";
    itemElement.classList.toggle("tile-movable", canBuy);
    itemElement.append(createTileElement(tile, {
      movable: canBuy,
      source: "marketplace"
    }));
    marketplace.append(itemElement);
  });

  const enteringItemElements = Array.from(marketplace.querySelectorAll(".marketplace-item:not(.marketplace-item-empty)"))
    .filter((itemElement) => enteringTileIds.has(itemElement.dataset.tileId));

  if (enteringItemElements.length > 0) {
    animateSequentialTileEnter(enteringItemElements);
  }

  renderedMarketplaceTileIds = nextMarketplaceTileIds;
}

function updatePlacementControls() {
  const canPlay = isMyTurn() && !gameState.gameOver;
  const hasActivePlacements = gameState.hasActivePlacements() || gameState.hasPendingMarketplacePurchases();

  document.body.classList.toggle("has-active-placement", canPlay && hasActivePlacements);
  document.body.classList.toggle("is-my-turn", canPlay);
  if (!canPlay) {
    setRedrawConfirmationVisible(false);
  }
  document.querySelectorAll("#redraw-tiles-button, #finish-placement-button, #reset-placement-button")
    .forEach((button) => {
      button.disabled = !canPlay;
    });

  const shuffleRackButton = document.querySelector("#shuffle-rack-button");

  if (shuffleRackButton) {
    shuffleRackButton.disabled = gameState.gameOver || getVisibleRack().length < 2;
  }
}

function renderScore() {
  const potentialPointsElement = document.querySelector("#potential-points");
  const currentGameIdElement = document.querySelector("#current-game-id");
  const currentTurnIndexElement = document.querySelector("#current-turn-index");
  const playerScoreListElement = document.querySelector("#player-score-list");
  const tilesRemainingElement = document.querySelector("#tiles-remaining");
  const totalTilePoolElement = document.querySelector("#total-tile-pool");
  const tilesUntilGameEndElement = document.querySelector("#tiles-until-game-end");

  if (potentialPointsElement) {
    potentialPointsElement.textContent = gameState.gameOver
      ? "--"
      : gameState.getCurrentTurnScore();
  }

  if (currentGameIdElement) {
    currentGameIdElement.textContent = gameState.id;
  }

  if (currentTurnIndexElement) {
    currentTurnIndexElement.textContent = getTurnDisplayNumber(gameState.turnIndex);
  }

  if (tilesRemainingElement) {
    tilesRemainingElement.textContent = gameState.tilesRemaining;
  }

  if (totalTilePoolElement) {
    totalTilePoolElement.textContent = gameState.totalTilePool;
  }

  if (tilesUntilGameEndElement) {
    if (gameState.gameOver) {
      tilesUntilGameEndElement.textContent = "Game over";
    } else if (gameState.isFinalTurn) {
      tilesUntilGameEndElement.textContent = "Final turn";
    } else if (gameState.isFinalRound || gameState.pendingFinalRound) {
      tilesUntilGameEndElement.textContent = "Final round";
    } else if (gameState.gameLength === "long") {
      tilesUntilGameEndElement.textContent = "Pool exhaustion";
    } else {
      tilesUntilGameEndElement.textContent = gameState.tilesUntilGameEndDrawTrigger;
    }
  }

  if (playerScoreListElement) {
    playerScoreListElement.replaceChildren();

    gameState.players.forEach((player, index) => {
      const row = document.createElement("div");
      const nameElement = document.createElement("div");
      const scoreElement = document.createElement("div");

      row.className = "player-score-row";
      row.classList.toggle("current-turn", index === gameState.currentPlayerIndex);
      nameElement.className = "player-score-name";
      scoreElement.className = "player-score-points";
      nameElement.textContent = player.name;

      if (index === gameState.currentPlayerIndex) {
        const badge = document.createElement("span");

        badge.className = "turn-badge";
        badge.title = gameState.isFinalTurn ? "Final turn" : "Current turn";

        if (gameState.isFinalTurn) {
          badge.textContent = "Last turn";
        } else {
          badge.classList.add("material-symbols-outlined");
          badge.textContent = "line_start_arrow_notch";
        }

        nameElement.append(badge);
      }

      scoreElement.textContent = player.score;
      row.append(nameElement, scoreElement);
      playerScoreListElement.append(row);
    });
  }
}

function renderGame(options = {}) {
  if (renderedGameId !== gameState.id) {
    renderedRackTileIds = new Set();
    renderedMarketplaceTileIds = new Set();
    renderedGameId = gameState.id;
    tileEnterQueueAvailableAt = 0;
  }

  destroySortables();
  renderBoard();
  renderRack({
    redrawEnter: options.rackRedrawEnter,
    shuffleRects: options.rackShuffleRects
  });
  renderMarketplace({
    delayMs: options.marketplaceDelayMs,
    enter: options.marketplaceEnter
  });
  updatePlacementControls();
  renderScore();
  initializeSortables();
  updateTurnPolling();
}

function setGameMessage(message) {
  const messageElement = document.querySelector("#game-message");

  if (messageElement) {
    messageElement.textContent = message;
  }
}

function setRedrawConfirmationVisible(isVisible) {
  document.body.classList.toggle("confirm-redraw", Boolean(isVisible));
}

function getGameIdFromURLHash() {
  const hash = window.location.hash.replace(/^#/, "").trim().toUpperCase();

  return /^[A-Z0-9]{5}$/.test(hash) ? hash : "";
}

function isGameListURLHash() {
  return window.location.hash.replace(/^#/, "").trim().toLowerCase() === "gamelist";
}

function isNewGameURLHash() {
  return window.location.hash.replace(/^#/, "").trim().toLowerCase() === "newgame";
}

function isRulesURLHash() {
  return window.location.hash.replace(/^#/, "").trim().toLowerCase() === "rules";
}

function setURLHash(hash, options = {}) {
  if (window.location.hash === hash) {
    return;
  }

  const historyMethod = options.replace ? "replaceState" : "pushState";

  window.history[historyMethod](null, "", hash);
}

function setGameURLGameId(gameId, options = {}) {
  const normalizedGameId = String(gameId || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{5}$/.test(normalizedGameId)) {
    return;
  }

  setURLHash(`#${normalizedGameId}`, options);
}

function setGameListURLHash(options = {}) {
  setURLHash("#gamelist", options);
}

function setNewGameURLHash(options = {}) {
  setURLHash("#newgame", options);
}

function setRulesURLHash(options = {}) {
  setURLHash("#rules", options);
}

function clearGameURLGameId() {
  if (!window.location.hash) {
    return;
  }

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function normalizePlayerName(name) {
  return String(name || "").trim();
}

function normalizeNameKey(name) {
  return normalizePlayerName(name).toLowerCase();
}

function isMyTurn() {
  const storedPlayerKey = normalizeNameKey(getStoredPlayerName());

  return Boolean(storedPlayerKey) && normalizeNameKey(gameState.currentPlayerName) === storedPlayerKey;
}

function getLoggedInPlayer() {
  const storedPlayerKey = normalizeNameKey(getStoredPlayerName());

  if (!storedPlayerKey) {
    return null;
  }

  return gameState.players.find((player) => normalizeNameKey(player.name) === storedPlayerKey) || null;
}

function getVisibleRack() {
  return getLoggedInPlayer()?.rack || gameState.currentRack;
}

function getPlayerRackFromState(source, playerName) {
  const playerKey = normalizeNameKey(playerName);

  return (source?.players || [])
    .find((player) => normalizeNameKey(player.name) === playerKey)
    ?.rack || [];
}

function moveVisibleRackTile(tileId, targetIndex) {
  const visibleRack = getVisibleRack();
  const sourceIndex = visibleRack.findIndex((tile) => tile.id === tileId);

  if (sourceIndex === -1) {
    return false;
  }

  const [tile] = visibleRack.splice(sourceIndex, 1);
  const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const normalizedTargetIndex = Math.max(0, Math.min(Number(adjustedTargetIndex), visibleRack.length));

  visibleRack.splice(normalizedTargetIndex, 0, tile);
  return true;
}

function shuffleVisibleRack() {
  const visibleRack = getVisibleRack();

  if (visibleRack.length < 2) {
    return false;
  }

  const originalTileIds = visibleRack.map((tile) => tile.id);
  const lodashShuffle = globalThis._?.shuffle;
  let shuffledRack = visibleRack;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    shuffledRack = typeof lodashShuffle === "function"
      ? lodashShuffle(visibleRack)
      : visibleRack
        .map((tile) => ({ tile, sort: Math.random() }))
        .sort((first, second) => first.sort - second.sort)
        .map(({ tile }) => tile);

    if (shuffledRack.some((tile, index) => tile.id !== originalTileIds[index])) {
      break;
    }
  }

  visibleRack.splice(0, visibleRack.length, ...shuffledRack);
  return true;
}

function getBoardTileSignatures(source) {
  const signatures = new Map();
  const boardTiles = source?.boardTiles || [];

  boardTiles.forEach((tile) => {
    if (Number.isInteger(Number(tile.row)) && Number.isInteger(Number(tile.column))) {
      signatures.set(`${Number(tile.row)},${Number(tile.column)}`, String(tile.letter || ""));
    }
  });

  return signatures;
}

function getChangedBoardCellKeys(nextGameState) {
  const currentTiles = getBoardTileSignatures(gameState.toJSON());
  const nextTiles = getBoardTileSignatures(nextGameState);
  const changedKeys = [];

  nextTiles.forEach((letter, cellKey) => {
    if (currentTiles.get(cellKey) !== letter) {
      changedKeys.push(cellKey);
    }
  });

  return changedKeys;
}

function getCookie(name) {
  const cookiePrefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(cookiePrefix));

  return cookie ? decodeURIComponent(cookie.slice(cookiePrefix.length)) : "";
}

function setCookie(name, value) {
  const maxAge = 60 * 60 * 24 * 365;

  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
}

function deleteCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/; samesite=lax`;
}

function getTurnNotificationsEnabled() {
  return window.localStorage.getItem(turnNotificationsKey) === "enabled";
}

function setTurnNotificationsEnabled(enabled) {
  if (enabled) {
    window.localStorage.setItem(turnNotificationsKey, "enabled");
  } else {
    window.localStorage.removeItem(turnNotificationsKey);
  }
}

function canUseNotifications() {
  return "Notification" in window;
}

function updateNotificationUI() {
  const notificationToggleItem = document.querySelector("#notification-toggle-item");
  const notificationToggleCheckbox = document.querySelector("#notification-toggle-checkbox");

  if (!notificationToggleItem || !notificationToggleCheckbox) {
    return;
  }

  if (!canUseNotifications()) {
    notificationToggleItem.hidden = true;
    return;
  }

  const notificationsBlocked = Notification.permission === "denied";

  notificationToggleItem.hidden = false;
  notificationToggleItem.setAttribute("aria-disabled", notificationsBlocked ? "true" : "false");
  notificationToggleCheckbox.disabled = notificationsBlocked;
  notificationToggleCheckbox.checked = getTurnNotificationsEnabled() && Notification.permission === "granted";
}

async function toggleTurnNotifications() {
  if (!canUseNotifications()) {
    setGameMessage("This browser does not support turn notifications.");
    return;
  }

  if (Notification.permission === "denied") {
    setTurnNotificationsEnabled(false);
    updateNotificationUI();
    setGameMessage("Turn notifications are blocked in your browser settings.");
    return;
  }

  if (getTurnNotificationsEnabled() && Notification.permission === "granted") {
    setTurnNotificationsEnabled(false);
    updateNotificationUI();
    setGameMessage("Turn notifications disabled.");
    return;
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  setTurnNotificationsEnabled(permission === "granted");
  updateNotificationUI();
  setGameMessage(permission === "granted"
    ? "Turn notifications enabled."
    : "Turn notifications were not enabled.");
}

function notifyIfMyTurn(options = {}) {
  if (
    !options.becameMyTurn ||
    !canUseNotifications() ||
    !getTurnNotificationsEnabled() ||
    Notification.permission !== "granted" ||
    !isMyTurn()
  ) {
    return;
  }

  const notificationKey = `${gameState.id}:${gameState.turnIndex}:${gameState.currentPlayerName}`;

  if (notificationKey === lastTurnNotificationKey) {
    return;
  }

  lastTurnNotificationKey = notificationKey;

  const notification = new Notification("WordWefter: your turn", {
    body: `It is your turn in game ${gameState.id}.`,
    tag: `wordwefter-${gameState.id}`,
    renotify: true
  });

  notification.addEventListener("click", () => {
    window.focus();
  });
}

function getStoredPlayerName() {
  return normalizePlayerName(getCookie(playerNameCookie));
}

function setStoredPlayerName(name) {
  const normalizedName = normalizePlayerName(name);

  if (normalizedName) {
    setCookie(playerNameCookie, normalizedName);
  }

  return normalizedName;
}

function updateIdentityUI() {
  const playerName = getStoredPlayerName();
  const identityNameDisplay = document.querySelector("#identity-name-display");
  const identityNameInput = document.querySelector("#identity-name-input");

  document.body.classList.toggle("has-player", Boolean(playerName));

  if (identityNameDisplay) {
    identityNameDisplay.textContent = playerName;
  }

  if (identityNameInput && document.activeElement !== identityNameInput) {
    identityNameInput.value = playerName;
  }

  updateNotificationUI();
}

function requirePlayerName(action, options = {}) {
  const playerName = getStoredPlayerName();

  if (playerName) {
    action();
    return;
  }

  pendingIdentityAction = action;
  setGameMessage("");
  setScreen("welcome", { clearGameURL: options.clearGameURL !== false });
  updateIdentityUI();
  document.querySelector("#identity-name-input")?.focus();
}

function getPlayerNameInputs() {
  return Array.from(document.querySelectorAll("#player-name-list .player-name-input"));
}

function updatePlayerRemoveButtons() {
  const rows = Array.from(document.querySelectorAll("#player-name-list .player-name-row"));

  rows.forEach((row, index) => {
    const button = row.querySelector(".player-name-remove");

    if (button) {
      button.disabled = index === 0 || rows.length <= 1;
    }
  });
}

function createPlayerNameRow(name = "", index = getPlayerNameInputs().length, options = {}) {
  const row = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");
  const removeButton = document.createElement("button");
  const playerNumber = index + 1;
  const inputId = `player-name-input-${playerNumber}`;
  const isLocked = Boolean(options.locked);

  row.className = "player-name-row";
  row.classList.toggle("locked", isLocked);
  label.className = "sr-only";
  label.htmlFor = inputId;
  label.textContent = `Player ${playerNumber} name`;
  input.className = "player-name-input";
  input.id = inputId;
  input.type = "text";
  input.value = name;
  input.placeholder = `Player ${playerNumber}`;
  input.setAttribute("aria-label", `Player ${playerNumber} name`);
  input.readOnly = isLocked;
  removeButton.className = "game-button secondary player-name-remove";
  removeButton.type = "button";
  removeButton.textContent = "-";
  removeButton.setAttribute("aria-label", "Remove player");
  removeButton.addEventListener("click", () => {
    if (getPlayerNameInputs().length <= 1) {
      return;
    }

    row.remove();
    updatePlayerRemoveButtons();
  });

  row.append(label, input);

  if (!isLocked) {
    row.append(removeButton);
  }

  return row;
}

function addPlayerNameInput(name = "") {
  const playerNameList = document.querySelector("#player-name-list");

  if (!playerNameList) {
    return null;
  }

  const row = createPlayerNameRow(name, getPlayerNameInputs().length);

  playerNameList.append(row);
  updatePlayerRemoveButtons();

  return row.querySelector(".player-name-input");
}

function renderPlayerNameInputs(playerNames) {
  const playerNameList = document.querySelector("#player-name-list");
  const storedPlayerName = getStoredPlayerName();
  const names = [
    storedPlayerName || playerNames[0] || "Player 1",
    ...playerNames.slice(1)
  ];

  if (!playerNameList || playerNameList.contains(document.activeElement)) {
    return;
  }

  playerNameList.replaceChildren();
  (names.length > 0 ? names : ["Player 1"]).forEach((name, index) => {
    playerNameList.append(createPlayerNameRow(name, index, { locked: index === 0 }));
  });
  updatePlayerRemoveButtons();
}

function parsePlayerNames() {
  const storedPlayerName = getStoredPlayerName();
  const playerNames = [
    storedPlayerName,
    ...getPlayerNameInputs().slice(1).map((input) => input.value)
  ]
    .map(normalizePlayerName)
    .filter(Boolean);

  return playerNames.length > 0 ? playerNames : ["Player 1"];
}

function getSelectedGameLength() {
  return document.querySelector("input[name='game-length']:checked")?.value || "medium";
}

function validatePlayerNames(playerNames) {
  const seenNames = new Set();
  const duplicateName = playerNames.find((name) => {
    const nameKey = normalizeNameKey(name);

    if (seenNames.has(nameKey)) {
      return true;
    }

    seenNames.add(nameKey);
    return false;
  });

  if (duplicateName) {
    return `Each player needs a different name. "${duplicateName}" is already in this game.`;
  }

  return "";
}

function setScreen(screenName, options = {}) {
  const shouldClearGameURL = options.clearGameURL !== false;

  document.body.classList.remove("screen-welcome", "screen-setup", "screen-list", "screen-play", "screen-rules");
  document.body.classList.add(`screen-${screenName}`);

  if (screenName !== "play" && shouldClearGameURL) {
    clearGameURLGameId();
  }

  closeIdentityMenu();
  updateTurnPolling();
}

function showRules(options = {}) {
  setGameMessage("");
  setScreen("rules", { clearGameURL: false });

  if (options.updateURL !== false) {
    setRulesURLHash({ replace: options.replaceURL === true });
  }
}

function showNewGameSetup(options = {}) {
  requirePlayerName(() => {
    const otherPlayerNames = gameState.players.slice(1).map((player) => player.name);

    renderPlayerNameInputs([
      getStoredPlayerName(),
      ...(otherPlayerNames.length > 0 ? otherPlayerNames : ["Player 2"])
    ]);
    setGameMessage("");
    setScreen("setup", { clearGameURL: false });

    if (options.updateURL !== false) {
      setNewGameURLHash({ replace: options.replaceURL === true });
    }
  });
}

async function showGameList(options = {}) {
  requirePlayerName(async () => {
    setGameMessage("");
    setScreen("list", { clearGameURL: false });

    if (options.updateURL !== false) {
      setGameListURLHash({ replace: options.replaceURL === true });
    }

    await loadActiveGames();
  });
}

function saveIdentityFromInput() {
  const identityNameInput = document.querySelector("#identity-name-input");
  const playerName = setStoredPlayerName(identityNameInput?.value);

  if (!playerName) {
    setGameMessage("Enter your name first.");
    identityNameInput?.focus();
    return;
  }

  updateIdentityUI();
  setGameMessage("");

  const nextAction = pendingIdentityAction;
  pendingIdentityAction = null;

  if (nextAction) {
    nextAction();
  } else {
    showGameList();
  }
}

function logoutPlayer() {
  deleteCookie(playerNameCookie);
  pendingIdentityAction = null;
  closeIdentityMenu();
  setScreen("welcome");
  setGameMessage("");
  updateIdentityUI();
  loadActiveGames();
}

function appendCacheBuster(url) {
  const cacheBusterURL = new URL(url, window.location.href);

  cacheBusterURL.searchParams.set("_", `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  return cacheBusterURL.pathname + cacheBusterURL.search + cacheBusterURL.hash;
}

async function fetchJSON(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    ...(method === "GET" ? {
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    } : {}),
    ...options.headers
  };
  const requestURL = method === "GET" ? appendCacheBuster(url) : url;
  const response = await fetch(requestURL, {
    cache: method === "GET" ? "no-store" : "default",
    ...options,
    method,
    headers
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Server request failed.");
  }

  return payload;
}

async function saveGameState() {
  const payload = await fetchJSON(serverURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(gameState.toJSON())
  });

  if (payload.stale) {
    throw new Error(payload.error || "Save ignored because a newer turn is already stored.");
  }

  if (payload.lastPlayDate) {
    gameState.lastPlayDate = payload.lastPlayDate;
  }

  return payload.id;
}

function clearRemotePlayedAnimationLater() {
  window.clearTimeout(remotePlayedClearTimer);
  remotePlayedClearTimer = window.setTimeout(() => {
    remotePlayedCellKeys.clear();
    renderGame();
  }, 1700);
}

async function pollActiveGameState() {
  if (
    !document.body.classList.contains("screen-play") ||
    isMyTurn() ||
    gameState.gameOver ||
    !/^[A-Z0-9]{5}$/.test(gameState.id)
  ) {
    updateTurnPolling();
    return;
  }

  try {
    const payload = await fetchJSON(
      `${serverURL}?action=load&id=${encodeURIComponent(gameState.id)}&turnIndex=${encodeURIComponent(gameState.turnIndex)}`
    );

    if (payload.changed === false) {
      updateTurnPolling();
      return;
    }

    const nextStateJSON = JSON.stringify(payload.gameState);
    const currentStateJSON = JSON.stringify(gameState.toJSON());

    if (nextStateJSON === currentStateJSON) {
      updateTurnPolling();
      return;
    }

    const changedCellKeys = getChangedBoardCellKeys(payload.gameState);
    const wasMyTurn = isMyTurn();
    const storedPlayerName = getStoredPlayerName();
    const previousVisibleRack = getVisibleRack();
    const nextVisibleRack = getPlayerRackFromState(payload.gameState, storedPlayerName);
    const visibleRackTileSetChanged = !gameState.rackTileSetsMatch(previousVisibleRack, nextVisibleRack);

    remotePlayedCellKeys = new Set(changedCellKeys);
    gameState.loadFromJSON(payload.gameState);
    captureTurnStartGameState();
    const becameMyTurn = !wasMyTurn && isMyTurn();
    const shouldRenderRefresh = becameMyTurn ||
      changedCellKeys.length > 0 ||
      visibleRackTileSetChanged ||
      gameState.gameOver ||
      gameState.hasActivePlacements() ||
      gameState.hasPendingMarketplacePurchases();

    if (shouldRenderRefresh) {
      renderGame();
    } else {
      updatePlacementControls();
      renderScore();
      updateTurnPolling();
    }

    notifyIfMyTurn({ becameMyTurn });

    if (changedCellKeys.length > 0) {
      clearRemotePlayedAnimationLater();
    }
  } catch (error) {
    setGameMessage(`Could not refresh game: ${error.message}`);
  } finally {
    updateTurnPolling();
  }
}

function updateTurnPolling() {
  const shouldPoll = document.body.classList.contains("screen-play") && !isMyTurn() && !gameState.gameOver;
  const pollMilliseconds = document.hidden
    ? backgroundTurnPollMilliseconds
    : foregroundTurnPollMilliseconds;

  if (!shouldPoll) {
    window.clearInterval(turnPollTimer);
    turnPollTimer = null;
    turnPollTimerMilliseconds = 0;
    return;
  }

  if (turnPollTimer && turnPollTimerMilliseconds !== pollMilliseconds) {
    window.clearInterval(turnPollTimer);
    turnPollTimer = null;
    turnPollTimerMilliseconds = 0;
  }

  if (!turnPollTimer) {
    turnPollTimerMilliseconds = pollMilliseconds;
    turnPollTimer = window.setInterval(pollActiveGameState, pollMilliseconds);
  }
}

function refreshTurnStateSoon() {
  window.clearTimeout(immediateTurnRefreshTimer);
  immediateTurnRefreshTimer = window.setTimeout(() => {
    updateTurnPolling();

    if (!document.hidden) {
      pollActiveGameState();
    }
  }, 0);
}

function getGameListTouchedTime(game) {
  const candidates = [
    game.lastPlayDate,
    game.updatedAt,
    game.modifiedAt,
    game.savedAt,
    game.startDate
  ];

  for (const candidate of candidates) {
    const timestamp = Date.parse(candidate);

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return Number(game.turnIndex || 0);
}

function getTurnDisplayNumber(turnIndex) {
  return Math.max(1, Number(turnIndex || 0) + 1);
}

function getGameListPlayerSummaries(game) {
  if (Array.isArray(game.players) && game.players.length > 0) {
    return game.players.map((player) => ({
      name: String(player?.name || "Player"),
      score: Number(player?.score || 0)
    }));
  }

  return (game.playerNames || []).map((name) => ({
    name,
    score: null
  }));
}

async function loadActiveGames() {
  const activeGamesList = document.querySelector("#active-games-list");
  const storedPlayerName = getStoredPlayerName();
  const storedPlayerKey = normalizeNameKey(storedPlayerName);

  if (!activeGamesList) {
    return;
  }

  if (!storedPlayerName) {
    activeGamesList.textContent = "";
    return;
  }

  try {
    const payload = await fetchJSON(`${serverURL}?action=list`);
    const matchingGames = (payload.games || [])
      .filter((game) => (
        (game.playerNames || []).some((name) => normalizeNameKey(name) === storedPlayerKey)
      ))
      .map((game) => ({
        ...game,
        isWaitingForStoredPlayer: !game.gameOver && normalizeNameKey(game.currentPlayerName) === storedPlayerKey
      }))
      .sort((firstGame, secondGame) => {
        if (firstGame.isWaitingForStoredPlayer !== secondGame.isWaitingForStoredPlayer) {
          return firstGame.isWaitingForStoredPlayer ? -1 : 1;
        }

        return getGameListTouchedTime(secondGame) - getGameListTouchedTime(firstGame);
      });

    activeGamesList.replaceChildren();

    if (matchingGames.length === 0) {
      const emptyElement = document.createElement("div");
      const emptyTitle = document.createElement("p");
      const emptyCopy = document.createElement("p");

      emptyElement.className = "active-games-empty";
      emptyTitle.className = "active-games-empty-title";
      emptyTitle.textContent = "No saved games";
      emptyCopy.className = "active-games-empty-copy";
      emptyCopy.textContent = `Games for ${storedPlayerName} will appear here.`;
      emptyElement.append(emptyTitle, emptyCopy);
      activeGamesList.append(emptyElement);
      return;
    }

    matchingGames.forEach((game) => {
      const row = document.createElement("div");
      const idElement = document.createElement("span");
      const gameCodeElement = document.createElement("span");
      const detailsElement = document.createElement("div");
      const playersElement = document.createElement("div");
      const turnElement = document.createElement("span");
      const resumeButton = document.createElement("button");

      row.className = "active-game-row";
      row.classList.toggle("waiting-player", game.isWaitingForStoredPlayer);
      row.dataset.gameId = game.id;
      idElement.className = "active-game-id";
      gameCodeElement.textContent = game.id;
      detailsElement.className = "active-game-details";
      playersElement.className = "active-game-player-list";
      turnElement.className = "active-game-turn";
      resumeButton.className = "game-button secondary";
      resumeButton.type = "button";
      idElement.append(gameCodeElement, turnElement);
      getGameListPlayerSummaries(game).forEach((player) => {
        const playerElement = document.createElement("span");
        const playerNameElement = document.createElement("span");
        const playerPointsElement = document.createElement("span");

        playerElement.className = "active-game-player-score";
        playerElement.classList.toggle("current-player", normalizeNameKey(player.name) === normalizeNameKey(game.currentPlayerName));
        playerNameElement.className = "active-game-player-name";
        playerNameElement.textContent = player.name;
        playerElement.append(playerNameElement);

        if (player.score !== null) {
          playerPointsElement.className = "active-game-player-points";
          playerPointsElement.textContent = player.score;
          playerElement.append(playerPointsElement);
        }

        playersElement.append(playerElement);
      });
      turnElement.textContent = game.gameOver
        ? `Completed ${getTurnDisplayNumber(game.turnIndex)}`
        : `Turn ${getTurnDisplayNumber(game.turnIndex)}`;
      resumeButton.textContent = game.gameOver ? "View" : "Resume";
      resumeButton.addEventListener("click", () => resumeGame(game.id));

      detailsElement.append(playersElement);
      row.append(idElement, detailsElement, resumeButton);
      activeGamesList.append(row);
    });
  } catch (error) {
    activeGamesList.textContent = `Could not load active games: ${error.message}`;
  }
}

async function loadGameById(gameId) {
  const normalizedGameId = String(gameId || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{5}$/.test(normalizedGameId)) {
    throw new Error("Game ID must be a 5 character letter/number string.");
  }

  const payload = await fetchJSON(`${serverURL}?action=load&id=${encodeURIComponent(normalizedGameId)}`);
  const storedPlayerKey = normalizeNameKey(getStoredPlayerName());
  const canPlayGame = (payload.gameState.players || [])
    .some((player) => normalizeNameKey(player.name) === storedPlayerKey);

  if (!canPlayGame) {
    throw new Error("This game does not include your player name.");
  }

  gameState.loadFromJSON(payload.gameState);
  captureTurnStartGameState();
  setScreen("play");
  setGameURLGameId(gameState.id);
  setGameMessage(gameState.gameOver ? "Game over. Viewing final board." : "");
  renderGame();
}

async function resumeGame(gameId) {
  try {
    await loadGameById(gameId);
  } catch (error) {
    setGameMessage(`Could not load game: ${error.message}`);
  }
}

async function loadGameFromURLHash() {
  const rawHash = window.location.hash.replace(/^#/, "").trim();
  const gameId = getGameIdFromURLHash();

  if (!rawHash || loadingGameFromURL) {
    return false;
  }

  if (isGameListURLHash()) {
    if (!getStoredPlayerName()) {
      requirePlayerName(() => {
        showGameList();
      }, { clearGameURL: false });
      setGameMessage("Enter your name to view your game list.");
      return true;
    }

    await showGameList();
    return true;
  }

  if (isNewGameURLHash()) {
    if (!getStoredPlayerName()) {
      requirePlayerName(() => {
        showNewGameSetup();
      }, { clearGameURL: false });
      setGameMessage("Enter your name to start a new game.");
      return true;
    }

    showNewGameSetup();
    return true;
  }

  if (isRulesURLHash()) {
    showRules({ updateURL: false });
    return true;
  }

  if (!gameId) {
    setScreen("welcome");
    clearGameURLGameId();
    setGameMessage("Could not load game: the URL game ID must be 5 letters or numbers.");
    return false;
  }

  if (!getStoredPlayerName()) {
    requirePlayerName(() => {
      loadGameFromURLHash();
    }, { clearGameURL: false });
    setGameMessage(`Enter your name to join game ${gameId}.`);
    return true;
  }

  loadingGameFromURL = true;

  try {
    await loadGameById(gameId);
    return true;
  } catch (error) {
    setScreen("welcome");
    clearGameURLGameId();
    setGameMessage(`Could not load game ${gameId}: ${error.message}`);
    return false;
  } finally {
    loadingGameFromURL = false;
  }
}

async function startNewGame() {
  const playerNames = parsePlayerNames();
  const validationMessage = validatePlayerNames(playerNames);

  if (!getStoredPlayerName()) {
    showNewGameSetup();
    return;
  }

  if (validationMessage) {
    setGameMessage(validationMessage);
    return;
  }

  gameState.setPlayerNames(playerNames);
  gameState.setGameLength(getSelectedGameLength());
  gameState.reset();
  gameState.lastPlayDate = gameState.startDate;
  gameState.players.forEach((_, index) => {
    gameState.currentPlayerIndex = index;
    gameState.drawSevenTiles({ ensureRainbow: true });
  });
  gameState.currentPlayerIndex = 0;
  captureTurnStartGameState();
  setScreen("play");
  setGameURLGameId(gameState.id);
  setGameMessage("");
  renderGame({
    marketplaceDelayMs: 2000,
    marketplaceEnter: true,
    rackRedrawEnter: true
  });

  try {
    await saveGameState();
    await loadActiveGames();
  } catch (error) {
    setGameMessage(`Game started, but could not save: ${error.message}`);
  }
}

async function redrawTilesAndSkipTurn() {
  if (!document.body.classList.contains("screen-play")) {
    showNewGameSetup();
    return;
  }

  if (!isMyTurn() || gameState.gameOver) {
    return;
  }

  if (gameState.hasActivePlacements()) {
    setGameMessage("Reset placed tiles before redrawing.");
    return;
  }

  setGameMessage("");
  setRedrawConfirmationVisible(true);
}

async function confirmRedrawTilesAndSkipTurn() {
  if (!document.body.classList.contains("screen-play")) {
    showNewGameSetup();
    return;
  }

  if (!isMyTurn() || gameState.gameOver) {
    setRedrawConfirmationVisible(false);
    return;
  }

  if (gameState.hasActivePlacements()) {
    setRedrawConfirmationVisible(false);
    setGameMessage("Reset placed tiles before redrawing.");
    return;
  }

  setRedrawConfirmationVisible(false);

  const shouldStartLongFinalRound = gameState.gameLength === "long" && gameState.tilesRemaining < 7;

  const redrawExitMilliseconds = animateRackRedrawExit();
  gameState.redrawCurrentRack({ availableOnly: shouldStartLongFinalRound });

  if (shouldStartLongFinalRound) {
    gameState.pendingFinalRound = true;
  }

  gameState.advanceTurn();
  gameState.advanceTurnIndex();
  captureTurnStartGameState();
  setGameMessage(gameState.gameOver
    ? "Game over."
    : gameState.isFinalTurn ? `${gameState.currentPlayerName}'s final turn.` : "");
  await wait(redrawExitMilliseconds);
  renderGame({ rackRedrawEnter: true });

  try {
    await saveGameState();
    await loadActiveGames();
  } catch (error) {
    setGameMessage(`Tiles redrawn, but could not save: ${error.message}`);
  }
}

function cancelRedrawTiles() {
  setRedrawConfirmationVisible(false);
}

async function shuffleRackTiles() {
  if (!document.body.classList.contains("screen-play")) {
    showNewGameSetup();
    return;
  }

  if (gameState.gameOver) {
    return;
  }

  const rackTileRects = getRackTileRects();

  if (!shuffleVisibleRack()) {
    return;
  }

  renderGame({ rackShuffleRects: rackTileRects });
}

async function finishPlacement() {
  if (!isMyTurn() || gameState.gameOver) {
    return;
  }

  const result = gameState.finishActivePlacements();

  if (result && !result.isValid) {
    setGameMessage(result.placementError || `Not in dictionary: ${result.invalidWords.join(", ")}`);
    renderGame();
  } else if (result && result.isValid) {
    gameState.commitMarketplacePurchases();
    const advanceResult = gameState.advanceTurn();

    gameState.advanceTurnIndex();
    captureTurnStartGameState();
    setGameMessage(gameState.gameOver
      ? "Game over."
      : gameState.isFinalTurn ? `${gameState.currentPlayerName}'s final turn.` : "");
    renderGame({ rackRedrawEnter: advanceResult.drawnTiles.length > 0 });
  } else {
    renderGame();
  }

  if (result && result.isValid) {
    try {
      await saveGameState();
      await loadActiveGames();
    } catch (error) {
      setGameMessage(`Turn finished, but could not save: ${error.message}`);
    }
  }
}

function resetPlacement() {
  if (!isMyTurn() || gameState.gameOver) {
    return;
  }

  setRedrawConfirmationVisible(false);
  if (!restoreTurnStartGameState()) {
    gameState.resetActivePlacements();
  }
  gameState.flashActivePlacements = false;
  setGameMessage("");
  renderGame();
}

function closeIdentityMenu() {
  const identityMenuButton = document.querySelector("#identity-menu-button");

  document.body.classList.remove("menu-open");

  if (identityMenuButton) {
    identityMenuButton.setAttribute("aria-expanded", "false");
  }
}

function toggleIdentityMenu() {
  const isOpen = !document.body.classList.contains("menu-open");
  const identityMenuButton = document.querySelector("#identity-menu-button");

  document.body.classList.toggle("menu-open", isOpen);

  if (identityMenuButton) {
    identityMenuButton.setAttribute("aria-expanded", String(isOpen));
  }
}

function destroySortables() {
  if (rackSortable) {
    rackSortable.destroy();
    rackSortable = null;
  }

  if (marketplaceSortable) {
    marketplaceSortable.destroy();
    marketplaceSortable = null;
  }

  boardSortables.forEach((sortable) => sortable.destroy());
  boardSortables = [];
}

function getSortableSource(event) {
  if (event.from?.id === "rack") {
    return "rack";
  }

  if (event.from?.id === "marketplace") {
    return "marketplace";
  }

  return "board";
}

function initializeRackSortable() {
  const rack = document.querySelector("#rack");

  if (!rack || !window.Sortable || gameState.gameOver) {
    return;
  }

  const canPlay = isMyTurn() && !gameState.gameOver;

  rackSortable = Sortable.create(rack, {
    animation: 120,
    chosenClass: "sortable-chosen",
    draggable: ".tile-movable",
    dragClass: "sortable-drag",
    fallbackClass: "sortable-fallback",
    forceFallback: true,
    ghostClass: "sortable-ghost",
    group: {
      name: "wordwefter-tiles",
      pull: canPlay,
      put: canPlay
    },
    onAdd(event) {
      if (!canPlay) {
        renderGame();
        return;
      }

      const tileSource = getSortableSource(event);

      if (tileSource === "marketplace") {
        if (gameState.moveMarketplaceTileToRack(event.item.dataset.tileId, event.newIndex)) {
          setGameMessage("");
          renderGame();
          return;
        }

        renderGame();
        return;
      }

      if (tileSource !== "board") {
        renderGame();
        return;
      }

      if (gameState.moveActiveTileToRack(event.item.dataset.tileId, event.newIndex)) {
        setGameMessage("");
      }

      renderGame();
    },
    onUpdate(event) {
      moveVisibleRackTile(event.item.dataset.tileId, event.newIndex);
      renderGame();
    }
  });
}

function initializeMarketplaceSortable() {
  const marketplace = document.querySelector("#marketplace");

  if (!marketplace || !window.Sortable || !isMyTurn() || gameState.gameOver) {
    return;
  }

  marketplaceSortable = Sortable.create(marketplace, {
    animation: 120,
    chosenClass: "sortable-chosen",
    draggable: ".marketplace-item",
    dragClass: "sortable-drag",
    fallbackClass: "sortable-fallback",
    forceFallback: true,
    ghostClass: "sortable-ghost",
    sort: false,
    group: {
      name: "wordwefter-tiles",
      pull: "clone",
      put(to, from, dragElement) {
        return dragElement?.dataset?.marketplacePending === "true";
      }
    },
    onStart(event) {
      event.item.classList.add("marketplace-item-source-empty");
    },
    onEnd(event) {
      event.item.classList.remove("marketplace-item-source-empty");
    },
    onAdd(event) {
      if (gameState.returnPendingMarketplaceTileToMarketplace(event.item.dataset.tileId)) {
        setGameMessage("");
      }

      renderGame();
    }
  });
}

function initializeBoardSortables() {
  if (!window.Sortable || !isMyTurn() || gameState.gameOver) {
    return;
  }

  document.querySelectorAll(".board-cell").forEach((cell) => {
    const sortable = Sortable.create(cell, {
      animation: 120,
      chosenClass: "sortable-chosen",
      draggable: ".tile-movable",
      dragClass: "sortable-drag",
      fallbackClass: "sortable-fallback",
      forceFallback: true,
      ghostClass: "sortable-ghost",
      invertSwap: false,
      sort: false,
      swapThreshold: 0.98,
      emptyInsertThreshold: 3,
      group: {
        name: "wordwefter-tiles",
        pull: true,
        put(to, from, dragElement) {
          const tileSource = from.el.id === "rack"
            ? "rack"
            : from.el.id === "marketplace"
              ? "marketplace"
              : "board";

          return gameState.canPlaceTile(
            dragElement.dataset.tileId,
            cell.dataset.row,
            cell.dataset.column,
            tileSource
          );
        }
      },
      onAdd(event) {
        const tileSource = getSortableSource(event);
        const wasPlaced = tileSource === "board"
          ? gameState.moveActiveTile(event.item.dataset.tileId, cell.dataset.row, cell.dataset.column)
          : tileSource === "marketplace"
            ? gameState.placeMarketplaceTile(event.item.dataset.tileId, cell.dataset.row, cell.dataset.column)
            : gameState.placeRackTile(event.item.dataset.tileId, cell.dataset.row, cell.dataset.column);

        if (wasPlaced) {
          setGameMessage("");
        }

        renderGame();
      }
    });

    boardSortables.push(sortable);
  });
}

function initializeSortables() {
  if (!window.Sortable) {
    setGameMessage("Drag and drop is unavailable because Sortable could not load.");
    return;
  }

  initializeRackSortable();
  initializeMarketplaceSortable();
  initializeBoardSortables();
}

function bindGameControls() {
  const saveIdentityButton = document.querySelector("#save-identity-button");
  const identityNameInput = document.querySelector("#identity-name-input");
  const identityMenuButton = document.querySelector("#identity-menu-button");
  const logoutButton = document.querySelector("#logout-button");
  const showNewGameButton = document.querySelector("#show-new-game-button");
  const showGameListButton = document.querySelector("#show-game-list-button");
  const showRulesButton = document.querySelector("#show-rules-button");
  const notificationToggleCheckbox = document.querySelector("#notification-toggle-checkbox");
  const createGameFromListButton = document.querySelector("#create-game-from-list-button");
  const createGameButton = document.querySelector("#create-game-button");
  const addPlayerButton = document.querySelector("#add-player-button");
  const shuffleRackButton = document.querySelector("#shuffle-rack-button");
  const redrawTilesButton = document.querySelector("#redraw-tiles-button");
  const confirmRedrawButton = document.querySelector("#confirm-redraw-button");
  const cancelRedrawButton = document.querySelector("#cancel-redraw-button");
  const finishPlacementButton = document.querySelector("#finish-placement-button");
  const resetPlacementButton = document.querySelector("#reset-placement-button");

  if (saveIdentityButton) {
    saveIdentityButton.addEventListener("click", saveIdentityFromInput);
  }

  if (identityNameInput) {
    identityNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        saveIdentityFromInput();
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logoutPlayer);
  }

  if (identityMenuButton) {
    identityMenuButton.addEventListener("click", toggleIdentityMenu);
  }

  if (showNewGameButton) {
    showNewGameButton.addEventListener("click", () => {
      closeIdentityMenu();
      showNewGameSetup();
    });
  }

  if (showGameListButton) {
    showGameListButton.addEventListener("click", () => {
      closeIdentityMenu();
      showGameList();
    });
  }

  if (showRulesButton) {
    showRulesButton.addEventListener("click", () => {
      closeIdentityMenu();
      showRules();
    });
  }

  if (createGameFromListButton) {
    createGameFromListButton.addEventListener("click", () => {
      closeIdentityMenu();
      showNewGameSetup();
    });
  }

  if (notificationToggleCheckbox) {
    notificationToggleCheckbox.addEventListener("change", toggleTurnNotifications);
  }

  if (createGameButton) {
    createGameButton.addEventListener("click", startNewGame);
  }

  if (addPlayerButton) {
    addPlayerButton.addEventListener("click", () => {
      const input = addPlayerNameInput(`Player ${getPlayerNameInputs().length + 1}`);

      input?.focus();
    });
  }

  if (redrawTilesButton) {
    redrawTilesButton.addEventListener("click", redrawTilesAndSkipTurn);
  }

  if (confirmRedrawButton) {
    confirmRedrawButton.addEventListener("click", confirmRedrawTilesAndSkipTurn);
  }

  if (cancelRedrawButton) {
    cancelRedrawButton.addEventListener("click", cancelRedrawTiles);
  }

  if (shuffleRackButton) {
    shuffleRackButton.addEventListener("click", shuffleRackTiles);
  }

  if (finishPlacementButton) {
    finishPlacementButton.addEventListener("click", finishPlacement);
  }

  if (resetPlacementButton) {
    resetPlacementButton.addEventListener("click", resetPlacement);
  }

}

async function initializeApp() {
  updateIdentityUI();
  renderPlayerNameInputs(parsePlayerNames());
  bindGameControls();
  updatePlayerRemoveButtons();
  const loadedHashGame = await loadGameFromURLHash();

  if (!loadedHashGame) {
    if (getStoredPlayerName()) {
      await showGameList({ replaceURL: true });
    } else {
      loadActiveGames();
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

document.addEventListener("visibilitychange", refreshTurnStateSoon);
window.addEventListener("focus", refreshTurnStateSoon);
window.addEventListener("pageshow", refreshTurnStateSoon);

window.addEventListener("hashchange", async () => {
  if (!window.location.hash) {
    return;
  }

  await loadGameFromURLHash();
});

window.startWordWefterGame = startNewGame;
window.shuffleWordWefterRack = shuffleRackTiles;
window.redrawWordWefterTiles = redrawTilesAndSkipTurn;
window.finishWordWefterPlacement = finishPlacement;
window.resetWordWefterPlacement = resetPlacement;

export { WordWefterGameState, gameState };
