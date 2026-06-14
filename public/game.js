import { dictionaryWordSet } from "./dictionary.js";
import { letter_points, letters_available } from "./letter-setup.js?v=common-one-prime-points";

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
    totalTiles: 69
  },
  normal: {
    label: "Normal",
    totalTiles: 136
  },
  long: {
    label: "Long",
    totalTiles: 205
  }
};

const wildcardLetter = "?";
const playableLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const wildcardPoolFrequency = 14;
const rackRainbowProbability = 1 / 14;

function normalizeGameLength(gameLength) {
  const normalizedLength = String(gameLength || "").trim().toLowerCase();

  if (normalizedLength === "medium") {
    return "normal";
  }

  return gameLengthSettings[normalizedLength] ? normalizedLength : "normal";
}

function createLettersAvailableForGameLength(gameLength) {
  const normalizedLength = normalizeGameLength(gameLength);
  const targetTotal = Math.max(1, Number(gameLengthSettings[normalizedLength].totalTiles || 1));
  const wildcardCount = Math.max(1, Math.round(targetTotal / wildcardPoolFrequency));
  const targetPlayableTotal = Math.max(1, targetTotal - wildcardCount);

  const playableTotal = playableLetters
    .reduce((total, letter) => total + Math.max(0, Number(letters_available[letter] || 0)), 0);
  const scaledLetters = playableLetters.map((letter) => {
    const exactCount = (Math.max(0, Number(letters_available[letter] || 0)) / playableTotal) * targetPlayableTotal;
    const count = Math.floor(exactCount);

    return {
      letter,
      count,
      remainder: exactCount - count
    };
  });
  let assignedTotal = scaledLetters.reduce((total, entry) => total + entry.count, 0);

  scaledLetters
    .sort((first, second) => second.remainder - first.remainder)
    .forEach((entry) => {
      if (assignedTotal < targetPlayableTotal) {
        entry.count += 1;
        assignedTotal += 1;
      }
    });

  return {
    [wildcardLetter]: wildcardCount,
    ...scaledLetters.reduce((counts, entry) => {
      counts[entry.letter] = entry.count;
      return counts;
    }, {})
  };
}

class WordWefterGameState {
  constructor(setup = {}) {
    const playerNames = setup.playerNames || [setup.playerName || "Player 1"];

    this.id = setup.id || WordWefterGameState.createGameId();
    this.startDate = setup.startDate || new Date().toISOString();
    this.lastPlayDate = setup.lastPlayDate || this.startDate;
    this.letterPoints = { ...letter_points, ...setup.letterPoints };
    this.gameLength = normalizeGameLength(setup.gameLength);
    this.startingLettersAvailable = { ...createLettersAvailableForGameLength(this.gameLength), ...setup.startingLettersAvailable };
    this.lettersAvailable = { ...this.startingLettersAvailable };
    if (setup.lettersAvailable) {
      this.lettersAvailable = { ...this.lettersAvailable, ...setup.lettersAvailable };
    }
    this.tilesDrawn = Number.isInteger(Number(setup.tilesDrawn)) ? Math.max(0, Number(setup.tilesDrawn)) : 0;
    this.finalTurnsRemaining = null;
    this.pendingFinalRound = false;
    this.gameOver = Boolean(setup.gameOver);
    this.concededByPlayerNames = this.normalizeConcededPlayerNames(setup);
    this.concededByPlayerName = this.getLastConcededPlayerName();
    this.dictionary = setup.dictionary || dictionaryWordSet;
    this.players = this.normalizePlayers(playerNames);
    this.history = this.normalizeHistory(setup.history);
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
    const entries = (Array.isArray(playerNames) ? playerNames : [playerNames])
      .map((entry, index) => {
        if (entry && typeof entry === "object") {
          const name = normalizePlayerName(entry.name || entry.invitedName || `Player ${index + 1}`);
          const claimed = entry.claimed !== false && !entry.open;

          return {
            name: name || `Player ${index + 1}`,
            invitedName: normalizePlayerName(entry.invitedName || ""),
            authKey: String(entry.authKey || ""),
            provider: String(entry.provider || ""),
            claimed,
            open: !claimed,
            score: 0,
            marketplacePurchaseCount: 0,
            newWords: [],
            rack: []
          };
        }

        return {
          name: normalizePlayerName(entry),
          claimed: true,
          open: false
        };
      })
      .filter((entry) => entry.name);
    const uniqueEntries = entries.length > 0 ? entries : [{ name: "Player 1", claimed: true, open: false }];

    return uniqueEntries.map((entry) => ({
      name: entry.name,
      ...(entry.invitedName ? { invitedName: entry.invitedName } : {}),
      ...(entry.authKey ? { authKey: entry.authKey } : {}),
      ...(entry.provider ? { provider: entry.provider } : {}),
      ...(entry.claimed === false ? { claimed: false, open: true } : {}),
      score: 0,
      marketplacePurchaseCount: 0,
      newWords: [],
      rack: []
    }));
  }

  normalizeConcededPlayerNames(source = {}) {
    const concededNames = Array.isArray(source.concededByPlayerNames)
      ? source.concededByPlayerNames
      : [];
    const legacyConcededName = normalizePlayerName(source.concededByPlayerName || "");
    const names = [...concededNames, legacyConcededName]
      .map(normalizePlayerName)
      .filter(Boolean);
    const seenKeys = new Set();

    return names.filter((name) => {
      const key = normalizeNameKey(name);

      if (!key || seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });
  }

  normalizeWordScore(entry) {
    const word = String(entry?.word || "").trim().toUpperCase();
    const score = Number(entry?.score || 0);

    if (!word) {
      return null;
    }

    return {
      word,
      score: Number.isFinite(score) ? score : 0
    };
  }

  normalizeHistoryEntry(entry, fallbackTurnIndex = 0) {
    const words = (entry?.words || [])
      .map((wordScore) => this.normalizeWordScore(wordScore))
      .filter(Boolean);

    const action = String(entry?.action || "").trim().toLowerCase();

    if (words.length === 0 && !["pass", "redraw", "concede"].includes(action)) {
      return null;
    }

    const turnIndex = Number(entry?.turnIndex);

    return {
      turnIndex: Number.isInteger(turnIndex) ? Math.max(0, turnIndex) : fallbackTurnIndex,
      playerName: String(entry?.playerName || "Player").trim() || "Player",
      words,
      ...(["pass", "redraw", "concede"].includes(action) ? { action } : {})
    };
  }

  normalizeHistory(history) {
    return (Array.isArray(history) ? history : [])
      .map((entry, index) => this.normalizeHistoryEntry(entry, index))
      .filter(Boolean);
  }

  getSerializedWordScores(words) {
    return (words || [])
      .map((wordScore) => this.normalizeWordScore(wordScore))
      .filter(Boolean);
  }

  recordTurnHistory(turnWords) {
    const words = this.getSerializedWordScores((turnWords || []).map((word) => ({
      word: word.word,
      score: word.score
    })));

    if (words.length === 0) {
      return null;
    }

    const entry = {
      turnIndex: this.turnIndex,
      playerName: this.currentPlayerName,
      words
    };

    this.player.newWords.push(...words);
    this.history.push(entry);
    return entry;
  }

  recordPassTurnHistory() {
    const entry = {
      turnIndex: this.turnIndex,
      playerName: this.currentPlayerName,
      action: "pass",
      words: []
    };

    this.history.push(entry);
    return entry;
  }

  recordRedrawTurnHistory() {
    const entry = {
      turnIndex: this.turnIndex,
      playerName: this.currentPlayerName,
      action: "redraw",
      words: []
    };

    this.history.push(entry);
    return entry;
  }

  recordConcedeTurnHistory(playerName) {
    const entry = {
      turnIndex: this.turnIndex,
      playerName: normalizePlayerName(playerName) || this.currentPlayerName,
      action: "concede",
      words: []
    };

    this.history.push(entry);
    return entry;
  }

  getConsecutivePassCount() {
    let passCount = 0;

    for (let index = this.history.length - 1; index >= 0; index -= 1) {
      if (this.history[index]?.action !== "pass") {
        break;
      }

      passCount += 1;
    }

    return passCount;
  }

  getVictorResult() {
    if (this.players.length === 0) {
      return null;
    }

    const eligiblePlayers = this.getActivePlayers();

    if (eligiblePlayers.length === 0) {
      return null;
    }

    const highScore = Math.max(...eligiblePlayers.map((player) => Number(player.score || 0)));
    const leaders = eligiblePlayers.filter((player) => Number(player.score || 0) === highScore);

    return {
      highScore,
      leaders
    };
  }

  get player() {
    return this.players[this.currentPlayerIndex] || this.players[0];
  }

  getLastConcededPlayerName() {
    return this.concededByPlayerNames[this.concededByPlayerNames.length - 1] || "";
  }

  getConcededPlayerNames() {
    return [...(this.concededByPlayerNames || [])];
  }

  getConcededPlayerKeys() {
    return new Set((this.concededByPlayerNames || [])
      .map(normalizeNameKey)
      .filter(Boolean));
  }

  isPlayerNameConceded(playerName) {
    return this.getConcededPlayerKeys().has(normalizeNameKey(playerName));
  }

  isPlayerConceded(player) {
    return this.isPlayerNameConceded(player?.name);
  }

  getActivePlayers() {
    const concededPlayerKeys = this.getConcededPlayerKeys();

    return this.players.filter((player) => !concededPlayerKeys.has(normalizeNameKey(player.name)));
  }

  getNextActivePlayerIndex(startIndex = this.currentPlayerIndex) {
    if (this.players.length === 0) {
      return 0;
    }

    for (let offset = 1; offset <= this.players.length; offset += 1) {
      const candidateIndex = (startIndex + offset) % this.players.length;

      if (!this.isPlayerConceded(this.players[candidateIndex])) {
        return candidateIndex;
      }
    }

    return Math.max(0, Math.min(startIndex, this.players.length - 1));
  }

  set player(player) {
    this.players = [player];
    this.currentPlayerIndex = 0;
  }

  get tilesRemaining() {
    return Object.values(this.lettersAvailable)
      .reduce((total, count) => total + Math.max(0, Number(count || 0)), 0);
  }

  get totalTilePool() {
    return Object.values(this.startingLettersAvailable)
      .reduce((total, count) => total + Math.max(0, Number(count || 0)), 0);
  }

  reconcileStartingPoolForLoadedState() {
    [wildcardLetter, ...playableLetters].forEach((letter) => {
      this.startingLettersAvailable[letter] = Math.max(
        Math.max(0, Number(this.startingLettersAvailable[letter] || 0)),
        Math.max(0, Number(this.lettersAvailable[letter] || 0))
      );
    });

    const expectedTotal = this.tilesRemaining + this.tilesDrawn;
    const currentTotal = this.totalTilePool;

    if (expectedTotal > currentTotal) {
      this.startingLettersAvailable.E += expectedTotal - currentTotal;
    }
  }

  get gameLengthSetting() {
    return gameLengthSettings[this.gameLength] || gameLengthSettings.normal;
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
    this.gameLength = normalizeGameLength(gameLength);
  }

  advanceTurn() {
    const result = {
      drawnTiles: []
    };

    if (this.gameOver) {
      return result;
    }

    if (this.getActivePlayers().length <= 1) {
      this.gameOver = true;
      this.pendingFinalRound = false;
      this.finalTurnsRemaining = null;
      return result;
    }

    this.currentPlayerIndex = this.getNextActivePlayerIndex();

    if (this.currentRack.length === 0) {
      const drawnTiles = this.drawSevenTiles();

      result.drawnTiles = drawnTiles;

    }

    return result;
  }

  passTurn() {
    this.recordPassTurnHistory();

    if (this.getConsecutivePassCount() >= this.getActivePlayers().length) {
      this.gameOver = true;
      this.pendingFinalRound = false;
      this.finalTurnsRemaining = null;
      return {
        drawnTiles: []
      };
    }

    return this.advanceTurn();
  }

  concedeGame(playerName) {
    const playerKey = normalizeNameKey(playerName);
    const playerIndex = this.players.findIndex((player) => normalizeNameKey(player.name) === playerKey);

    if (this.gameOver || playerIndex === -1 || this.isPlayerConceded(this.players[playerIndex])) {
      return false;
    }

    const wasCurrentPlayer = playerIndex === this.currentPlayerIndex;
    const concededPlayerName = this.players[playerIndex].name;

    this.concededByPlayerNames.push(concededPlayerName);
    this.concededByPlayerName = this.getLastConcededPlayerName();

    if (wasCurrentPlayer) {
      this.resetActivePlacements();
    }

    this.recordConcedeTurnHistory(concededPlayerName);

    const activePlayers = this.getActivePlayers();

    if (activePlayers.length <= 1) {
      const remainingPlayerIndex = this.players.findIndex((player) => !this.isPlayerConceded(player));

      if (remainingPlayerIndex !== -1) {
        this.currentPlayerIndex = remainingPlayerIndex;
      }

      this.gameOver = true;
      this.pendingFinalRound = false;
      this.finalTurnsRemaining = null;
      return true;
    }

    if (wasCurrentPlayer) {
      this.currentPlayerIndex = this.getNextActivePlayerIndex(playerIndex);

      if (this.currentRack.length === 0) {
        this.drawSevenTiles();
      }
    }

    return true;
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
      const shouldForceNonWildcard = Boolean(options.ensureRainbow) &&
        drawnTiles.length === tileCount - 1 &&
        !drawnTiles.some((drawnTile) => !drawnTile.wildcard) &&
        this.hasAvailableMarketplaceLetters();
      const tile = this.drawTile({ excludeWildcards: shouldForceNonWildcard });

      if (tile) {
        drawnTiles.push(this.prepareRackDrawnTile(tile, {
          suppressRandomRainbow: Boolean(options.ensureRainbow)
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
      this.tilesRemaining > 0 &&
      this.hasAvailableMarketplaceLetters()
    ) {
      const wasGameOver = this.gameOver;
      const tile = this.drawTile();

      if (!tile) {
        continue;
      }

      if (tile.wildcard) {
        this.returnTileToAvailableLetters(tile, { restoreDrawCount: true });

        if (!wasGameOver && this.tilesRemaining > 0) {
          this.gameOver = false;
          this.pendingFinalRound = false;
          this.finalTurnsRemaining = null;
        }

        if (!this.hasAvailableMarketplaceLetters()) {
          break;
        }

        continue;
      }

      const emptyIndex = this.marketplaceTiles.findIndex((marketplaceTile) => !marketplaceTile);

      if (emptyIndex === -1) {
        this.marketplaceTiles.push(tile);
      } else {
        this.marketplaceTiles[emptyIndex] = tile;
      }
      drawnTiles.push(tile);
    }

    return drawnTiles;
  }

  hasAvailableMarketplaceLetters() {
    return playableLetters.some((letter) => Math.max(0, Number(this.lettersAvailable[letter] || 0)) > 0);
  }

  prepareRackDrawnTile(tile, options = {}) {
    return !options.suppressRandomRainbow &&
      tile.letter !== wildcardLetter &&
      Math.random() < rackRainbowProbability
      ? {
        ...tile,
        rainbow: true
      }
      : tile;
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

  returnTileToAvailableLetters(tile, options = {}) {
    const letter = String(tile?.sourceLetter || tile?.letter || "").toUpperCase();

    if (!letter || !Object.hasOwn(this.lettersAvailable, letter)) {
      return;
    }

    this.lettersAvailable[letter] += 1;

    if (options.restoreDrawCount) {
      this.tilesDrawn = Math.max(0, this.tilesDrawn - 1);
    }
  }

  redrawCurrentRack() {
    this.currentRack.forEach((tile) => {
      this.returnTileToAvailableLetters(tile, { restoreDrawCount: true });
    });

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

  drawTile(options = {}) {
    const weightedLetters = Object.entries(this.lettersAvailable)
      .filter(([letter, count]) => (
        count > 0 &&
        (!options.excludeWildcards || letter !== wildcardLetter)
      ));
    const totalWeight = weightedLetters.reduce((total, [, count]) => total + count, 0);

    if (totalWeight === 0) {
      return null;
    }

    let drawIndex = Math.floor(Math.random() * totalWeight);

    for (const [letter, count] of weightedLetters) {
      if (drawIndex < count) {
        this.lettersAvailable[letter] -= 1;
        this.tilesDrawn += 1;

        if (this.tilesRemaining === 0) {
          this.gameOver = true;
          this.pendingFinalRound = false;
          this.finalTurnsRemaining = null;
        }

        return {
          id: `tile-${this.nextTileId++}`,
          letter,
          points: this.letterPoints[letter],
          ...(letter === wildcardLetter ? { wildcard: true } : {}),
        };
      }

      drawIndex -= count;
    }

    return null;
  }

  reset() {
    this.startingLettersAvailable = createLettersAvailableForGameLength(this.gameLength);
    this.lettersAvailable = { ...this.startingLettersAvailable };
    this.id = WordWefterGameState.createGameId();
    this.startDate = new Date().toISOString();
    this.players = this.players.map((player) => ({
      name: player.name,
      ...(player.invitedName ? { invitedName: player.invitedName } : {}),
      ...(player.authKey ? { authKey: player.authKey } : {}),
      ...(player.provider ? { provider: player.provider } : {}),
      ...(player.claimed === false || player.open ? { claimed: false, open: true } : {}),
      score: 0,
      marketplacePurchaseCount: 0,
      newWords: [],
      rack: []
    }));
    this.history = [];
    this.currentPlayerIndex = 0;
    this.turnIndex = 0;
    this.tilesDrawn = 0;
    this.finalTurnsRemaining = null;
    this.pendingFinalRound = false;
    this.gameOver = false;
    this.concededByPlayerNames = [];
    this.concededByPlayerName = "";
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
      ...(this.gameOver ? { gameOver: true } : {}),
      ...(this.concededByPlayerNames.length > 0 ? {
        concededByPlayerNames: [...this.concededByPlayerNames],
        concededByPlayerName: this.getLastConcededPlayerName()
      } : {}),
      turnIndex: this.turnIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      ...(this.history.length > 0 ? {
        history: this.history.map((entry) => ({
          turnIndex: entry.turnIndex,
          playerName: entry.playerName,
          ...(entry.action ? { action: entry.action } : {}),
          words: entry.words.map((wordScore) => ({ ...wordScore }))
        }))
      } : {}),
      players: this.players.map((player) => ({
        name: player.name,
        ...(player.invitedName ? { invitedName: player.invitedName } : {}),
        ...(player.authKey ? { authKey: player.authKey } : {}),
        ...(player.provider ? { provider: player.provider } : {}),
        ...(player.claimed === false || player.open ? { claimed: false, open: true } : {}),
        score: player.score,
        ...(Number(player.marketplacePurchaseCount) > 0 ? {
          marketplacePurchaseCount: Math.max(0, Number(player.marketplacePurchaseCount || 0))
        } : {}),
        ...(player.newWords?.length > 0 ? {
          newWords: player.newWords.map((wordScore) => ({ ...wordScore }))
        } : {}),
        rack: player.rack.map((tile) => this.serializeTile(tile))
      })),
      startingLettersAvailable: { ...this.startingLettersAvailable },
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

    this.letterPoints = { ...letter_points };
    this.gameLength = normalizeGameLength(source.gameLength);
    this.startingLettersAvailable = source.startingLettersAvailable
      ? { ...createLettersAvailableForGameLength(this.gameLength), ...source.startingLettersAvailable }
      : createLettersAvailableForGameLength(this.gameLength);
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
    this.tilesDrawn = Number.isInteger(Number(source.tilesDrawn))
      ? Math.max(0, Number(source.tilesDrawn))
      : Math.max(0, this.totalTilePool - this.tilesRemaining);
    this.reconcileStartingPoolForLoadedState();
    this.finalTurnsRemaining = null;
    this.pendingFinalRound = false;
    this.gameOver = Boolean(source.gameOver) || this.tilesRemaining === 0;
    this.concededByPlayerNames = this.normalizeConcededPlayerNames(source);
    this.concededByPlayerName = this.getLastConcededPlayerName();
    this.turnIndex = Number.isInteger(Number(source.turnIndex)) ? Math.max(0, Number(source.turnIndex)) : 0;
    this.history = this.normalizeHistory(source.history);
    this.players = (source.players || []).map((player) => {
      const name = String(player.name || "Player");
      const hydratedRack = (player.rack || []).map(hydrateTile);
      const previousRack = previousRackByPlayerName.get(normalizeNameKey(name));

      return {
        name,
        invitedName: normalizePlayerName(player.invitedName || ""),
        authKey: String(player.authKey || ""),
        provider: String(player.provider || ""),
        claimed: player.claimed !== false && !player.open,
        open: player.claimed === false || Boolean(player.open),
        score: Number(player.score || 0),
        marketplacePurchaseCount: Math.max(0, Number(player.marketplacePurchaseCount || 0)),
        newWords: this.getSerializedWordScores(player.newWords),
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

    if (this.history.length > 0) {
      const playerWordsByName = new Map(this.players.map((player) => [normalizeNameKey(player.name), []]));

      this.history.forEach((entry) => {
        const playerWords = playerWordsByName.get(normalizeNameKey(entry.playerName));

        if (playerWords) {
          playerWords.push(...entry.words.map((wordScore) => ({ ...wordScore })));
        }
      });

      this.players.forEach((player) => {
        player.newWords = playerWordsByName.get(normalizeNameKey(player.name)) || player.newWords;
      });
    }

    const loadedPlayerIndex = Number(source.currentPlayerIndex);
    this.currentPlayerIndex = Number.isInteger(loadedPlayerIndex)
      ? Math.max(0, Math.min(loadedPlayerIndex, this.players.length - 1))
      : 0;
    if (!this.gameOver && this.isPlayerConceded(this.player) && this.getActivePlayers().length > 0) {
      this.currentPlayerIndex = this.getNextActivePlayerIndex();
    }
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

  getPendingMarketplacePurchaseCost() {
    return this.getPendingMarketplaceTiles()
      .reduce((total, tile) => total + Math.max(0, Number(tile.marketplaceCost || 0)), 0);
  }

  getCurrentTurnPotentialScore() {
    return this.getCurrentTurnScore() - this.getPendingMarketplacePurchaseCost();
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
    this.recordTurnHistory(turnWords);

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

    this.drawTiles(Math.max(0, 7 - this.currentRack.length));

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
const playerNameStorageKey = "wordwefterPlayerName";
const playerAuthStorageKey = "wordwefterPlayerAuth";
const friendsStorageKey = "wordwefterFriends";
const oauthStateStorageKey = "wordwefterOAuthState";
const oauthDisplayNameStorageKey = "wordwefterOAuthDisplayName";
const localOAuthUserIdsStorageKey = "wordwefterLocalOAuthUserIds";
const turnNotificationsKey = "wordwefterTurnNotifications";
const foregroundTurnPollMilliseconds = 3000;
const backgroundTurnPollMilliseconds = 120000;
const gameListRefreshMilliseconds = 10000;
const maxPlayerSlots = 6;
let rackSortable = null;
let marketplaceSortable = null;
let boardSortables = [];
let pendingIdentityAction = null;
let pendingOAuthDisplayAuth = null;
let turnPollTimer = null;
let turnPollTimerMilliseconds = 0;
let immediateTurnRefreshTimer = null;
let gameListRefreshTimer = null;
let loadingActiveGames = false;
let gameMessageClearTimer = null;
let gameMessageExitTimer = null;
let lastTurnNotificationKey = "";
let remotePlayedCellKeys = new Set();
let remotePlayedClearTimer = null;
let loadingGameFromURL = false;
let marketplaceRenderTimer = null;
let renderedRackTileKeys = [];
let renderedMarketplaceTileKeys = [];
let renderedGameId = "";
let turnStartGameStateJSON = "";
let showingPoolView = false;
let waitingGamesForMenu = [];
let serverOAuthConfig = null;
const tileEnterDurations = [520, 560, 540, 500];
const tileEnterYOffsets = ["0.45rem", "-0.4rem", "-0.55rem", "0.16rem"];
const tileEnterRotations = ["-10deg", "11deg", "-6deg", "5deg"];
const rainbowTileAnimationMilliseconds = 7200;
const rainbowTileAnimationStartedAt = Date.now();
const gameMessageAnimationMilliseconds = 180;
let tileEnterQueueAvailableAt = 0;

function isLegacyNameLoginAllowed() {
  return /(^|\.)willshaver\.com$/i.test(window.location.hostname);
}

function isLocalOAuthFallbackAllowed() {
  return window.location.protocol === "http:" &&
    /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|wordwefter)$/i.test(window.location.hostname);
}

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
    runRedrawPoolAccountingCheck,
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
  document.documentElement.dataset.wordWefterWildcardPivotResolutionCheck = JSON.stringify(
    runWildcardPivotResolutionCheck()
  );
  updateWordWefterTestingDataset();
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
  renderedRackTileKeys = getTileAnimationKeys(getVisibleRack());
  renderedMarketplaceTileKeys = getTileAnimationKeys(gameState.marketplaceTiles);
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
    tileElement.style.setProperty(
      "--rainbow-animation-delay",
      `-${(Date.now() - rainbowTileAnimationStartedAt) % rainbowTileAnimationMilliseconds}ms`
    );
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

function getTileAnimationKey(tile) {
  return gameState.getRackTileSignature(tile);
}

function getTileAnimationKeys(tiles) {
  return (tiles || [])
    .filter(Boolean)
    .map((tile) => getTileAnimationKey(tile));
}

function getNewTileAnimationKeyCounts(nextTiles, previousTileKeys) {
  const previousCounts = (previousTileKeys || []).reduce((counts, key) => {
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());

  return (nextTiles || [])
    .filter(Boolean)
    .reduce((newCounts, tile) => {
      const key = getTileAnimationKey(tile);
      const previousCount = previousCounts.get(key) || 0;

      if (previousCount > 0) {
        previousCounts.set(key, previousCount - 1);
      } else {
        newCounts.set(key, (newCounts.get(key) || 0) + 1);
      }

      return newCounts;
    }, new Map());
}

function consumeTileAnimationKeyCount(counts, tile) {
  const key = getTileAnimationKey(tile);
  const count = counts.get(key) || 0;

  if (count <= 0) {
    return false;
  }

  counts.set(key, count - 1);
  return true;
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
  const enteringTileKeyCounts = getNewTileAnimationKeyCounts(visibleRack, renderedRackTileKeys);

  if (!rack) {
    return;
  }

  rack.replaceChildren();

  visibleRack.forEach((tile) => {
    rack.append(createTileElement(tile, { movable: !gameState.gameOver, source: "rack" }));
  });

  animateRackShuffle(options.shuffleRects);

  const enteringTileElements = Array.from(rack.querySelectorAll(".tile"))
    .filter((tileElement, index) => consumeTileAnimationKeyCount(enteringTileKeyCounts, visibleRack[index]));

  if (enteringTileElements.length > 0) {
    animateSequentialTileEnter(enteringTileElements);
  }

  renderedRackTileKeys = getTileAnimationKeys(visibleRack);
}

function animateMarketplaceEnter() {
  animateSequentialTileEnter(Array.from(document.querySelectorAll("#marketplace .marketplace-item:not(.marketplace-item-empty)")));
}

function renderMarketplace(options = {}) {
  const marketplace = document.querySelector("#marketplace");
  const marketplaceCostBadge = document.querySelector(".marketplace-cost-badge");
  const marketplaceCostElement = document.querySelector("#marketplace-cost");
  const enteringTileKeyCounts = options.enter
    ? getNewTileAnimationKeyCounts(gameState.marketplaceTiles, [])
    : getNewTileAnimationKeyCounts(gameState.marketplaceTiles, renderedMarketplaceTileKeys);

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
    marketplaceCostElement.textContent = getDisplayedMarketplaceTileCost();
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
    .filter((itemElement) => {
      const tile = gameState.marketplaceTiles.find((marketplaceTile) => (
        marketplaceTile?.id === itemElement.dataset.tileId
      ));

      return consumeTileAnimationKeyCount(enteringTileKeyCounts, tile);
    });

  if (enteringItemElements.length > 0) {
    animateSequentialTileEnter(enteringItemElements);
  }

  renderedMarketplaceTileKeys = getTileAnimationKeys(gameState.marketplaceTiles);
}

function updatePlacementControls() {
  const canPlay = isMyTurn() && !gameState.gameOver;
  const hasActivePlacements = gameState.hasActivePlacements() || gameState.hasPendingMarketplacePurchases();

  document.body.classList.toggle("has-active-placement", canPlay && hasActivePlacements);
  document.body.classList.toggle("is-my-turn", canPlay);
  if (!canPlay) {
    setRedrawConfirmationVisible(false);
    setPassConfirmationVisible(false);
  }
  document.querySelectorAll("#redraw-tiles-button, #pass-turn-button, #finish-placement-button, #reset-placement-button")
    .forEach((button) => {
      button.disabled = !canPlay;
    });

  const shuffleRackButton = document.querySelector("#shuffle-rack-button");

  if (shuffleRackButton) {
    shuffleRackButton.hidden = gameState.gameOver;
    shuffleRackButton.disabled = gameState.gameOver || getVisibleRack().length < 2;
  }

  const concedeGameControl = document.querySelector("#concede-game-control");
  const concedeGameButton = document.querySelector("#concede-game-button");
  const loggedInPlayer = getLoggedInPlayer();
  const canConcede = Boolean(loggedInPlayer) &&
    !gameState.gameOver &&
    !gameState.isPlayerConceded(loggedInPlayer);

  if (concedeGameControl) {
    concedeGameControl.hidden = !canConcede;
  }

  if (concedeGameButton) {
    concedeGameButton.hidden = !canConcede;
    concedeGameButton.disabled = !canConcede;
  }

  if (!canConcede) {
    setConcedeConfirmationVisible(false);
  }
}

function createWordScoreList(words, emptyText = "No words yet") {
  const list = document.createElement("div");

  list.className = "word-score-list";

  if (!Array.isArray(words) || words.length === 0) {
    const emptyElement = document.createElement("span");

    emptyElement.className = "word-score-empty";
    emptyElement.textContent = emptyText;
    list.append(emptyElement);
    return list;
  }

  words.forEach((wordScore) => {
    const item = document.createElement("span");
    const wordElement = document.createElement("span");
    const scoreElement = document.createElement("span");

    item.className = "word-score-item";
    wordElement.className = "word-score-word";
    scoreElement.className = "word-score-points";
    wordElement.textContent = wordScore.word;
    scoreElement.textContent = `+${wordScore.score}`;
    item.append(wordElement, scoreElement);
    list.append(item);
  });

  return list;
}

function getConcessionResultText(victorResult) {
  const concededNames = gameState.getConcededPlayerNames();

  if (concededNames.length === 0 || !victorResult || victorResult.leaders.length === 0) {
    return "";
  }

  const concededText = concededNames.length === 1
    ? `${concededNames[0]} conceded`
    : `${concededNames.join(", ")} conceded`;

  return `${concededText}. Winner: ${victorResult.leaders.map((player) => player.name).join(", ")}`;
}

function renderGameLog(gameLogElement) {
  gameLogElement.replaceChildren();

  const header = document.createElement("div");
  const title = document.createElement("h3");

  header.className = "game-log-header";
  title.className = "game-log-title";
  title.textContent = "Game Log";
  header.append(title);
  gameLogElement.append(header);

  if (gameState.gameOver) {
    const victorResult = gameState.getVictorResult();
    const resultElement = document.createElement("div");
    const labelElement = document.createElement("span");
    const namesElement = document.createElement("strong");

    resultElement.className = "game-log-result";
    labelElement.className = "game-log-result-label";

    if (gameState.getConcededPlayerNames().length > 0 && victorResult && victorResult.leaders.length > 0) {
      labelElement.textContent = "Conceded";
      namesElement.textContent = getConcessionResultText(victorResult);
    } else if (victorResult && victorResult.leaders.length > 0) {
      labelElement.textContent = victorResult.leaders.length === 1 ? "Winner" : "Tie";
      namesElement.textContent = `${victorResult.leaders.map((player) => player.name).join(", ")} - ${victorResult.highScore} points`;
    } else {
      labelElement.textContent = "Game over";
      namesElement.textContent = "Final scores stand";
    }

    resultElement.append(labelElement, namesElement);
    gameLogElement.append(resultElement);
  }

  if (gameState.history.length === 0) {
    const emptyElement = document.createElement("div");

    emptyElement.className = "game-log-empty";
    emptyElement.textContent = "No completed turns yet.";
    gameLogElement.append(emptyElement);
    return;
  }

  const list = document.createElement("div");

  list.className = "game-log-list";
  [...gameState.history].reverse().forEach((entry) => {
    const item = document.createElement("article");
    const heading = document.createElement("div");
    const turnElement = document.createElement("span");
    const playerElement = document.createElement("strong");
    const actionLabels = {
      pass: "Passed turn",
      redraw: "Redraw Tiles",
      concede: "Conceded game"
    };

    item.className = "game-log-entry";
    heading.className = "game-log-heading";
    turnElement.className = "game-log-turn";
    playerElement.className = "game-log-player";
    turnElement.textContent = `Turn ${getTurnDisplayNumber(entry.turnIndex)}`;
    playerElement.textContent = entry.playerName;
    heading.append(turnElement, playerElement);
    item.append(
      heading,
      actionLabels[entry.action]
        ? createWordScoreList([], actionLabels[entry.action])
        : createWordScoreList(entry.words, "No words")
    );
    list.append(item);
  });
  gameLogElement.append(list);
}

function renderPoolView(gameLogElement) {
  gameLogElement.replaceChildren();

  const header = document.createElement("div");
  const title = document.createElement("h3");
  const poolGrid = document.createElement("div");

  header.className = "game-log-header";
  title.className = "game-log-title";
  title.textContent = "Pool";

  header.append(title);
  poolGrid.className = "pool-grid";

  [...playableLetters, wildcardLetter].forEach((letter) => {
    const item = document.createElement("div");
    const letterElement = document.createElement("span");
    const countElement = document.createElement("span");

    item.className = "pool-letter";
    letterElement.className = "pool-letter-name";
    countElement.className = "pool-letter-count";
    letterElement.textContent = letter;
    countElement.textContent = Math.max(0, Number(gameState.lettersAvailable[letter] || 0));

    item.append(letterElement, countElement);
    poolGrid.append(item);
  });

  gameLogElement.append(header, poolGrid);
}

function renderScore() {
  const potentialPointsElement = document.querySelector("#potential-points");
  const currentGameIdElement = document.querySelector("#current-game-id");
  const currentTurnIndexElement = document.querySelector("#current-turn-index");
  const playerScoreListElement = document.querySelector("#player-score-list");
  const gameLogElement = document.querySelector("#game-log");
  const winnerBannerElement = document.querySelector("#winner-banner");
  const winnerBannerLabelElement = document.querySelector("#winner-banner-label");
  const winnerBannerNamesElement = document.querySelector("#winner-banner-names");
  const tilesRemainingElement = document.querySelector("#tiles-remaining");
  const viewPoolButton = document.querySelector("#view-pool-button");

  if (winnerBannerElement) {
    const victorResult = gameState.gameOver ? gameState.getVictorResult() : null;

    winnerBannerElement.setAttribute("aria-hidden", victorResult ? "false" : "true");

    if (winnerBannerLabelElement) {
      winnerBannerLabelElement.textContent = victorResult
        ? gameState.getConcededPlayerNames().length > 0 ? "Conceded" : victorResult.leaders.length === 1 ? "Winner" : "Tie Game"
        : "";
    }

    if (winnerBannerNamesElement) {
      winnerBannerNamesElement.textContent = victorResult
        ? gameState.getConcededPlayerNames().length > 0
          ? getConcessionResultText(victorResult)
          : `${victorResult.leaders.map((player) => player.name).join(", ")} - ${victorResult.highScore} points`
        : "";
    }
  }

  if (potentialPointsElement) {
    const potentialPoints = gameState.getCurrentTurnPotentialScore();

    potentialPointsElement.textContent = gameState.gameOver
      ? "--"
      : potentialPoints;
    potentialPointsElement.classList.toggle("negative", !gameState.gameOver && potentialPoints < 0);
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

  if (viewPoolButton) {
    viewPoolButton.setAttribute("aria-pressed", showingPoolView ? "true" : "false");
    viewPoolButton.textContent = showingPoolView ? "View Log" : "View Pool";
  }

  if (playerScoreListElement) {
    playerScoreListElement.replaceChildren();

    gameState.players.forEach((player, index) => {
      const row = document.createElement("div");
      const nameElement = document.createElement("div");
      const scoreElement = document.createElement("div");
      const playerConceded = gameState.isPlayerConceded(player);

      row.className = "player-score-row";
      row.classList.toggle("current-turn", !gameState.gameOver && !playerConceded && index === gameState.currentPlayerIndex);
      row.classList.toggle("conceded-player", playerConceded);
      nameElement.className = "player-score-name";
      scoreElement.className = "player-score-points";
      nameElement.textContent = player.name;

      if (playerConceded) {
        const badge = document.createElement("span");

        badge.className = "conceded-badge";
        badge.textContent = "Conceded";
        nameElement.append(badge);
      } else if (!gameState.gameOver && index === gameState.currentPlayerIndex) {
        const badge = document.createElement("span");

        badge.className = "turn-badge";
        badge.title = "Current turn";
        badge.classList.add("material-symbols-outlined");
        badge.textContent = "line_start_arrow_notch";

        nameElement.append(badge);
      }

      scoreElement.textContent = player.score;
      row.append(nameElement, scoreElement);
      playerScoreListElement.append(row);
    });
  }

  if (gameLogElement) {
    if (showingPoolView) {
      renderPoolView(gameLogElement);
    } else {
      renderGameLog(gameLogElement);
    }
  }
}

function renderGame(options = {}) {
  document.body.classList.toggle("game-over", gameState.gameOver);

  if (renderedGameId !== gameState.id) {
    renderedRackTileKeys = [];
    renderedMarketplaceTileKeys = [];
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
  updateInviteLinkUI();
  updateWordWefterTestingDataset();
  initializeSortables();
  updateTurnPolling();
}

function setGameMessage(message, options = {}) {
  const messageElement = document.querySelector("#game-message");
  const clearAfterMs = Math.max(0, Number(options.clearAfterMs || 0));

  window.clearTimeout(gameMessageClearTimer);
  window.clearTimeout(gameMessageExitTimer);
  gameMessageClearTimer = null;
  gameMessageExitTimer = null;

  if (messageElement) {
    if (!message) {
      if (!messageElement.textContent) {
        messageElement.classList.remove("has-message", "message-exiting");
        return;
      }

      messageElement.classList.add("message-exiting");
      messageElement.classList.remove("has-message");
      gameMessageExitTimer = window.setTimeout(() => {
        messageElement.textContent = "";
        messageElement.classList.remove("message-exiting");
      }, gameMessageAnimationMilliseconds);
      return;
    }

    messageElement.textContent = message;
    messageElement.classList.remove("message-exiting");
    messageElement.classList.add("has-message");

    if (clearAfterMs > 0) {
      gameMessageClearTimer = window.setTimeout(() => {
        if (messageElement.textContent === message) {
          setGameMessage("");
        }
      }, clearAfterMs);
    }
  }
}

function setRedrawConfirmationVisible(isVisible) {
  document.body.classList.toggle("confirm-redraw", Boolean(isVisible));
}

function setPassConfirmationVisible(isVisible) {
  document.body.classList.toggle("confirm-pass", Boolean(isVisible));
}

function setConcedeConfirmationVisible(isVisible) {
  document.body.classList.toggle("confirm-concede", Boolean(isVisible));
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

  return Boolean(storedPlayerKey) &&
    normalizeNameKey(gameState.currentPlayerName) === storedPlayerKey &&
    !gameState.isPlayerNameConceded(getStoredPlayerName());
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

function getDisplayedMarketplaceTileCost() {
  return gameState.getMarketplaceTileCost(getLoggedInPlayer() || gameState.player);
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
  let cookie = "";

  try {
    cookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(cookiePrefix)) || "";
  } catch {
    cookie = "";
  }

  return cookie ? decodeURIComponent(cookie.slice(cookiePrefix.length)) : "";
}

function setCookie(name, value) {
  const maxAge = 60 * 60 * 24 * 365;

  try {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
  } catch {
    // Some privacy modes reject cookie access; localStorage is used as a fallback.
  }
}

function deleteCookie(name) {
  try {
    document.cookie = `${encodeURIComponent(name)}=; max-age=0; path=/; samesite=lax`;
  } catch {
    // Some privacy modes reject cookie access; localStorage is cleared separately.
  }
}

function getLocalStorageItem(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function setLocalStorageItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeLocalStorageItem(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function parseJSONStorageItem(key, fallbackValue) {
  try {
    const value = window.localStorage.getItem(key);

    return value ? JSON.parse(value) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function setJSONStorageItem(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function getStoredPlayerAuth() {
  const auth = parseJSONStorageItem(playerAuthStorageKey, null);
  const fallbackName = getStoredPlayerName();

  if (auth && typeof auth === "object" && normalizePlayerName(auth.name)) {
    const provider = String(auth.provider || "name");

    if (provider === "name" && !isLegacyNameLoginAllowed()) {
      return null;
    }

    return {
      provider,
      userId: String(auth.userId || normalizeNameKey(auth.name)),
      name: normalizePlayerName(auth.name),
      signedInAt: String(auth.signedInAt || ""),
      displayNameConfirmed: Boolean(auth.displayNameConfirmed),
      sessionToken: String(auth.sessionToken || ""),
      accessToken: String(auth.accessToken || "")
    };
  }

  return fallbackName && isLegacyNameLoginAllowed()
    ? {
      provider: "name",
      userId: normalizeNameKey(fallbackName),
      name: fallbackName,
      signedInAt: "",
      displayNameConfirmed: true
    }
    : null;
}

function getStoredPlayerAuthKey() {
  const auth = getStoredPlayerAuth();

  return auth ? `${auth.provider}:${auth.userId || normalizeNameKey(auth.name)}` : "";
}

function getProviderLabel(provider) {
  const labels = {
    google: "Google",
    facebook: "Facebook",
    name: "Name"
  };

  return labels[String(provider || "").toLowerCase()] || "Account";
}

function isRealOAuthAuth(auth) {
  const provider = String(auth?.provider || "").toLowerCase();
  const userId = String(auth?.userId || "").trim();
  const isLocalFallback = userId.startsWith("local-");

  return ["google", "facebook"].includes(provider) &&
    userId &&
    userId.toLowerCase() !== "null" &&
    (!isLocalFallback || isLocalOAuthFallbackAllowed());
}

function getLocalOAuthUserId(provider) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const storedIds = parseJSONStorageItem(localOAuthUserIdsStorageKey, {});

  if (storedIds && typeof storedIds === "object" && String(storedIds[normalizedProvider] || "").startsWith(`local-${normalizedProvider}-`)) {
    return String(storedIds[normalizedProvider]);
  }

  const userId = `local-${normalizedProvider}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  setJSONStorageItem(localOAuthUserIdsStorageKey, {
    ...(storedIds && typeof storedIds === "object" ? storedIds : {}),
    [normalizedProvider]: userId
  });
  return userId;
}

function setStoredPlayerAuth(auth) {
  const normalizedProvider = String(auth?.provider || "name").toLowerCase();

  if (normalizedProvider === "name" && !isLegacyNameLoginAllowed()) {
    return null;
  }

  const normalizedName = setStoredPlayerName(auth?.name);

  if (!normalizedName) {
    return null;
  }

  const normalizedAuth = {
    provider: normalizedProvider,
    userId: String(auth?.userId || normalizeNameKey(normalizedName)),
    name: normalizedName,
    signedInAt: new Date().toISOString(),
    displayNameConfirmed: auth?.displayNameConfirmed !== false,
    ...(auth?.sessionToken ? { sessionToken: String(auth.sessionToken) } : {}),
    ...(auth?.accessToken ? { accessToken: String(auth.accessToken) } : {})
  };

  setJSONStorageItem(playerAuthStorageKey, normalizedAuth);
  return normalizedAuth;
}

function normalizePendingOAuthDisplayAuth(auth) {
  if (!auth || typeof auth !== "object") {
    return null;
  }

  const provider = String(auth.provider || "").toLowerCase();
  const userId = String(auth.userId || "");

  if (!provider || !userId) {
    return null;
  }

  return {
    provider,
    userId,
    suggestedName: normalizePlayerName(auth.suggestedName || ""),
    accessToken: String(auth.accessToken || ""),
    returnHash: String(auth.returnHash || "#gamelist")
  };
}

function setPendingOAuthDisplayAuth(auth) {
  pendingOAuthDisplayAuth = normalizePendingOAuthDisplayAuth(auth);

  if (pendingOAuthDisplayAuth) {
    setJSONStorageItem(oauthDisplayNameStorageKey, pendingOAuthDisplayAuth);
  } else {
    removeLocalStorageItem(oauthDisplayNameStorageKey);
  }

  return pendingOAuthDisplayAuth;
}

function getPendingOAuthDisplayAuth() {
  if (pendingOAuthDisplayAuth) {
    return pendingOAuthDisplayAuth;
  }

  pendingOAuthDisplayAuth = normalizePendingOAuthDisplayAuth(
    parseJSONStorageItem(oauthDisplayNameStorageKey, null)
  );
  return pendingOAuthDisplayAuth;
}

function clearPendingOAuthDisplayAuth() {
  pendingOAuthDisplayAuth = null;
  removeLocalStorageItem(oauthDisplayNameStorageKey);
}

function getConfirmedDisplayNameForOAuth(provider, userId) {
  const auth = getStoredPlayerAuth();

  if (
    auth &&
    auth.provider === provider &&
    String(auth.userId || "") === String(userId || "") &&
    auth.displayNameConfirmed
  ) {
    return auth.name;
  }

  return "";
}

async function mergeOldStyleSavesForAuth(auth) {
  if (!auth || auth.provider === "name") {
    return null;
  }

  try {
    return await fetchJSON(`${serverURL}?action=merge_identity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        playerName: auth.name,
        authKey: `${auth.provider}:${auth.userId || normalizeNameKey(auth.name)}`,
        provider: auth.provider
      })
    });
  } catch {
    return null;
  }
}

async function lookupStoredOAuthUserLogin(provider, userId) {
  if (!isRealOAuthAuth({ provider, userId })) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      action: "user_login",
      provider,
      userId
    });
    const payload = await fetchJSON(`${serverURL}?${params.toString()}`);
    const username = normalizePlayerName(payload.user?.username || payload.user?.name || "");

    return payload.found && username ? username : null;
  } catch {
    return null;
  }
}

async function saveStoredOAuthUserLogin(auth) {
  if (!isRealOAuthAuth(auth)) {
    return null;
  }

  try {
    return await fetchJSON(`${serverURL}?action=save_user_login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        provider: auth.provider,
        userId: auth.userId,
        username: auth.name,
        accessToken: auth.accessToken || ""
      })
    });
  } catch {
    return null;
  }
}

function getOAuthConfig(provider) {
  return serverOAuthConfig?.[provider] || {};
}

function hasOAuthProviderConfig(provider) {
  return Boolean(String(getOAuthConfig(provider).clientId || "").trim());
}

function providerLoginIsVisible(provider) {
  return hasOAuthProviderConfig(provider) || isLocalOAuthFallbackAllowed();
}

function updateOAuthLoginAvailability() {
  const googleAvailable = providerLoginIsVisible("google");
  const facebookAvailable = providerLoginIsVisible("facebook");

  document.documentElement.classList.toggle("oauth-google-available", googleAvailable);
  document.documentElement.classList.toggle("oauth-facebook-available", facebookAvailable);
  document.documentElement.classList.toggle("oauth-login-available", googleAvailable || facebookAvailable);
}

async function loadOAuthConfig() {
  if (serverOAuthConfig) {
    updateOAuthLoginAvailability();
    return serverOAuthConfig;
  }

  try {
    const payload = await fetchJSON(`${serverURL}?action=oauth_config`);
    serverOAuthConfig = payload.oauth && typeof payload.oauth === "object"
      ? payload.oauth
      : {};
  } catch {
    serverOAuthConfig = {};
  }

  updateOAuthLoginAvailability();
  return serverOAuthConfig;
}

function getOAuthRedirectURI() {
  return `${window.location.origin}${window.location.pathname}`;
}

function createOAuthState(provider) {
  const state = `${provider}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  setJSONStorageItem(oauthStateStorageKey, {
    state,
    provider,
    returnHash: window.location.hash || "#gamelist"
  });
  return state;
}

function buildOAuthURL(provider, config) {
  const state = createOAuthState(provider);
  const redirectURI = getOAuthRedirectURI();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectURI,
    response_type: "token",
    scope: config.scope || (provider === "google" ? "openid profile email" : "public_profile,email"),
    state
  });

  if (provider === "google") {
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

async function startOAuthLogin(provider) {
  const normalizedProvider = String(provider || "").toLowerCase();
  await loadOAuthConfig();
  const config = getOAuthConfig(normalizedProvider);

  if (config.clientId) {
    window.location.assign(buildOAuthURL(normalizedProvider, config));
    return;
  }

  if (!isLocalOAuthFallbackAllowed()) {
    setGameMessage(`${getProviderLabel(normalizedProvider)} sign-in is not configured.`);
    return;
  }

  const userId = getLocalOAuthUserId(normalizedProvider);
  const storedName = await lookupStoredOAuthUserLogin(normalizedProvider, userId);

  if (storedName) {
    const auth = setStoredPlayerAuth({
      provider: normalizedProvider,
      userId,
      name: storedName,
      accessToken: "",
      displayNameConfirmed: true
    });
    await finishIdentitySignIn({ mergeAuth: auth });
    return;
  }

  const pendingAuth = setPendingOAuthDisplayAuth({
    provider: normalizedProvider,
    userId,
    suggestedName: "",
    accessToken: "",
    returnHash: window.location.hash || "#gamelist"
  });
  showOAuthDisplayNamePage(pendingAuth);
}

async function fetchOAuthProfile(provider, accessToken) {
  const endpoint = provider === "google"
    ? "https://www.googleapis.com/oauth2/v3/userinfo"
    : `https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(endpoint, provider === "google"
    ? { headers: { Authorization: `Bearer ${accessToken}` } }
    : {});

  if (!response.ok) {
    throw new Error("Could not read OAuth profile.");
  }

  const profile = await response.json();

  return {
    userId: String(profile.sub || profile.id || ""),
    name: normalizePlayerName(profile.name)
  };
}

async function completeOAuthRedirectIfPresent() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const state = params.get("state");
  const savedState = parseJSONStorageItem(oauthStateStorageKey, null);

  if (!accessToken || !state || !savedState || savedState.state !== state) {
    return false;
  }

  removeLocalStorageItem(oauthStateStorageKey);
  let profile = null;

  try {
    profile = await fetchOAuthProfile(savedState.provider, accessToken);
  } catch {
    profile = null;
  }

  const provider = savedState.provider;
  const userId = profile?.userId || state;
  const confirmedName = getConfirmedDisplayNameForOAuth(provider, userId) ||
    await lookupStoredOAuthUserLogin(provider, userId);
  window.history.replaceState(null, "", savedState.returnHash || "#gamelist");

  if (confirmedName) {
    const auth = setStoredPlayerAuth({
      provider,
      userId,
      name: confirmedName,
      accessToken,
      displayNameConfirmed: true
    });
    await finishIdentitySignIn({ mergeAuth: auth });
    return true;
  }

  showOAuthDisplayNamePage(setPendingOAuthDisplayAuth({
    provider,
    userId,
    suggestedName: "",
    accessToken,
    returnHash: savedState.returnHash || "#gamelist"
  }));
  return true;
}

async function finishIdentitySignIn(options = {}) {
  updateIdentityUI();
  setGameMessage("");

  if (options.mergeAuth) {
    const loginSaveResult = await saveStoredOAuthUserLogin(options.mergeAuth);

    if (loginSaveResult?.user?.sessionToken) {
      options.mergeAuth = setStoredPlayerAuth({
        ...options.mergeAuth,
        accessToken: "",
        sessionToken: loginSaveResult.user.sessionToken
      });
    }
    const mergeResult = await mergeOldStyleSavesForAuth(options.mergeAuth);

    if (mergeResult?.merged > 0) {
      setGameMessage(`Merged ${mergeResult.merged} saved game${mergeResult.merged === 1 ? "" : "s"} for ${options.mergeAuth.name}.`);
    }
  }

  const nextAction = pendingIdentityAction;
  pendingIdentityAction = null;

  if (nextAction) {
    nextAction();
  } else {
    showGameList();
  }
}

function getStoredFriends() {
  return parseJSONStorageItem(friendsStorageKey, [])
    .filter((friend) => friend && normalizePlayerName(friend.name))
    .map((friend) => ({
      key: String(friend.key || normalizeNameKey(friend.name)),
      name: normalizePlayerName(friend.name),
      provider: String(friend.provider || ""),
      lastPlayedAt: String(friend.lastPlayedAt || "")
    }))
    .sort((first, second) => Date.parse(second.lastPlayedAt || 0) - Date.parse(first.lastPlayedAt || 0));
}

function rememberFriendsFromGame(game) {
  const currentName = getStoredPlayerName();
  const currentKey = normalizeNameKey(currentName);
  const authKey = getStoredPlayerAuthKey();
  const players = Array.isArray(game?.players) ? game.players : [];
  const isParticipant = players.some((player) => (
    normalizeNameKey(player.name) === currentKey ||
    (authKey && String(player.authKey || "") === authKey)
  ));

  if (!currentKey || !isParticipant) {
    return;
  }

  const touchedAt = game.lastPlayDate || game.startDate || new Date().toISOString();
  const friendsByKey = new Map(getStoredFriends().map((friend) => [friend.key, friend]));

  players.forEach((player) => {
    const name = normalizePlayerName(player.name);
    const key = String(player.authKey || normalizeNameKey(name));

    if (!name || normalizeNameKey(name) === currentKey || (authKey && key === authKey) || player.open || player.claimed === false) {
      return;
    }

    friendsByKey.set(key, {
      key,
      name,
      provider: String(player.provider || ""),
      lastPlayedAt: touchedAt
    });
  });

  setJSONStorageItem(friendsStorageKey, Array.from(friendsByKey.values())
    .sort((first, second) => Date.parse(second.lastPlayedAt || 0) - Date.parse(first.lastPlayedAt || 0))
    .slice(0, 80));
}

function getTurnNotificationsEnabled() {
  return getLocalStorageItem(turnNotificationsKey) === "enabled";
}

function setTurnNotificationsEnabled(enabled) {
  if (enabled) {
    setLocalStorageItem(turnNotificationsKey, "enabled");
  } else {
    removeLocalStorageItem(turnNotificationsKey);
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

function getCurrentInviteLink() {
  if (!/^[A-Z0-9]{5}$/.test(gameState.id)) {
    return "";
  }

  return `${window.location.origin}${window.location.pathname}#${gameState.id}`;
}

function hasOpenPlayerSpots(game = gameState) {
  return (game.players || []).some((player) => (
    player.open ||
    player.claimed === false ||
    /^open spot \d+$/i.test(String(player.name || ""))
  ));
}

function updateInviteLinkUI() {
  const inviteLinkPanel = document.querySelector("#invite-link-panel");
  const inviteLinkValue = document.querySelector("#invite-link-value");
  const shouldShowInviteLink = hasOpenPlayerSpots();

  if (inviteLinkPanel) {
    inviteLinkPanel.hidden = !shouldShowInviteLink;
  }

  if (inviteLinkValue) {
    inviteLinkValue.textContent = shouldShowInviteLink ? getCurrentInviteLink() : "";
  }
}

async function copyInviteLink() {
  const inviteLink = getCurrentInviteLink();

  if (!inviteLink) {
    return;
  }

  try {
    await navigator.clipboard.writeText(inviteLink);
    setGameMessage("Invite link copied.", { clearAfterMs: 2000 });
  } catch {
    setGameMessage(inviteLink, { clearAfterMs: 2000 });
  }
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
  return normalizePlayerName(getCookie(playerNameCookie) || getLocalStorageItem(playerNameStorageKey));
}

function setStoredPlayerName(name) {
  const normalizedName = normalizePlayerName(name);

  if (normalizedName) {
    setCookie(playerNameCookie, normalizedName);
    setLocalStorageItem(playerNameStorageKey, normalizedName);
  }

  return normalizedName;
}

function updateIdentityUI() {
  const auth = getStoredPlayerAuth();
  const playerName = auth?.name || "";
  const identityNameDisplay = document.querySelector("#identity-name-display");
  const identityNameInput = document.querySelector("#identity-name-input");
  const identityProviderDisplay = document.querySelector("#identity-provider-display");

  document.body.classList.toggle("has-player", Boolean(playerName));
  document.documentElement.classList.toggle("local-name-login-allowed", isLegacyNameLoginAllowed());
  updateOAuthLoginAvailability();

  if (identityNameDisplay) {
    identityNameDisplay.textContent = playerName;
  }

  if (identityProviderDisplay) {
    identityProviderDisplay.textContent = auth?.provider && auth.provider !== "name"
      ? getProviderLabel(auth.provider)
      : "";
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
  if (isLegacyNameLoginAllowed()) {
    document.querySelector("#identity-name-input")?.focus();
  } else if (providerLoginIsVisible("google")) {
    document.querySelector("#google-login-button")?.focus();
  } else if (providerLoginIsVisible("facebook")) {
    document.querySelector("#facebook-login-button")?.focus();
  }
}

function showOAuthDisplayNamePage(auth = getPendingOAuthDisplayAuth()) {
  const pendingAuth = setPendingOAuthDisplayAuth(auth);
  const displayNameInput = document.querySelector("#oauth-display-name-input");
  const providerNameElement = document.querySelector("#oauth-display-provider-name");
  const providerCopyElement = document.querySelector("#oauth-display-provider-copy");

  if (!pendingAuth) {
    setScreen("welcome");
    setGameMessage("Could not finish sign-in. Try again.");
    return;
  }

  const providerLabel = getProviderLabel(pendingAuth.provider);

  if (providerNameElement) {
    providerNameElement.textContent = providerLabel;
  }

  if (providerCopyElement) {
    providerCopyElement.textContent = `Choose the name other players will see for your ${providerLabel} login.`;
  }

  if (displayNameInput) {
    displayNameInput.value = pendingAuth.suggestedName || getStoredPlayerName() || "";
  }

  setGameMessage("");
  setScreen("display-name", { clearGameURL: false });
  displayNameInput?.focus();
  displayNameInput?.select();
}

async function saveOAuthDisplayName() {
  const pendingAuth = getPendingOAuthDisplayAuth();
  const displayNameInput = document.querySelector("#oauth-display-name-input");
  const displayName = normalizePlayerName(displayNameInput?.value);

  if (!pendingAuth) {
    setScreen("welcome");
    setGameMessage("Could not finish sign-in. Try again.");
    return;
  }

  if (!displayName) {
    setGameMessage("Enter a display name.");
    displayNameInput?.focus();
    return;
  }

  const auth = setStoredPlayerAuth({
    provider: pendingAuth.provider,
    userId: pendingAuth.userId,
    name: displayName,
    accessToken: pendingAuth.accessToken,
    displayNameConfirmed: true
  });
  const returnHash = pendingAuth.returnHash || "#gamelist";

  clearPendingOAuthDisplayAuth();
  if (returnHash && window.location.hash !== returnHash) {
    window.history.replaceState(null, "", returnHash);
  }
  await finishIdentitySignIn({ mergeAuth: auth });
}

function getPlayerNameInputs() {
  return Array.from(document.querySelectorAll("#player-name-list .player-name-input"));
}

function updatePlayerRemoveButtons() {
  const rows = Array.from(document.querySelectorAll("#player-name-list .player-name-row"));
  const addPlayerButton = document.querySelector("#add-player-button");

  rows.forEach((row, index) => {
    const button = row.querySelector(".player-name-remove");

    if (button) {
      button.disabled = index === 0 || rows.length <= 2;
    }
  });

  if (addPlayerButton) {
    addPlayerButton.disabled = rows.length >= maxPlayerSlots;
  }
}

function createPlayerNameRow(name = "", index = getPlayerNameInputs().length, options = {}) {
  const row = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");
  const removeButton = document.createElement("button");
  const playerNumber = index + 1;
  const inputId = `player-name-input-${playerNumber}`;
  const isLocked = Boolean(options.locked);
  const isGuest = options.guest === true || normalizePlayerName(name).toLowerCase() === "guest";

  row.className = "player-name-row";
  row.classList.toggle("locked", isLocked);
  row.classList.toggle("guest", isGuest);
  row.dataset.friendKey = options.friendKey || "";
  row.dataset.friendProvider = options.friendProvider || "";
  row.dataset.slotType = isLocked ? "host" : options.friendKey ? "friend" : "guest";
  label.className = "sr-only";
  label.htmlFor = inputId;
  label.textContent = `Player ${playerNumber} slot`;
  input.className = "player-name-input";
  input.id = inputId;
  input.type = "text";
  input.value = name || (isLocked ? "" : "Guest");
  input.placeholder = isLocked ? `Player ${playerNumber}` : "Guest";
  input.setAttribute("aria-label", `Player ${playerNumber} slot`);
  input.readOnly = true;
  removeButton.className = "game-button secondary player-name-remove";
  removeButton.type = "button";
  removeButton.textContent = "-";
  removeButton.setAttribute("aria-label", "Remove player");
  removeButton.addEventListener("click", () => {
    if (getPlayerNameInputs().length <= 2) {
      return;
    }

    row.remove();
    syncSelectedFriendSlots();
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

  if (getPlayerNameInputs().length >= maxPlayerSlots) {
    updatePlayerRemoveButtons();
    return null;
  }

  const row = createPlayerNameRow(name || "Guest", getPlayerNameInputs().length, { guest: !name || name === "Guest" });

  playerNameList.append(row);
  syncSelectedFriendSlots();
  updatePlayerRemoveButtons();

  return row.querySelector(".player-name-input");
}

function renderPlayerNameInputs(playerNames) {
  const playerNameList = document.querySelector("#player-name-list");
  const storedPlayerName = getStoredPlayerName();
  const names = [
    storedPlayerName || playerNames[0] || "Player 1",
    ...(playerNames.slice(1).length > 0 ? playerNames.slice(1) : ["Guest"])
  ];

  if (!playerNameList || playerNameList.contains(document.activeElement)) {
    return;
  }

  playerNameList.replaceChildren();
  (names.length >= 2 ? names : [names[0] || "Player 1", "Guest"]).forEach((name, index) => {
    playerNameList.append(createPlayerNameRow(name || "Guest", index, {
      locked: index === 0,
      guest: index > 0 && normalizePlayerName(name).toLowerCase() === "guest"
    }));
  });
  syncSelectedFriendSlots();
  updatePlayerRemoveButtons();
}

function formatFriendRecency(lastPlayedAt) {
  const timestamp = Date.parse(lastPlayedAt);

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));

  if (days === 0) {
    return "recent";
  }

  return `${days}d ago`;
}

function renderFriendInviteOptions() {
  const friendInviteList = document.querySelector("#friend-invite-list");

  if (!friendInviteList) {
    return;
  }

  const friends = getStoredFriends();
  friendInviteList.replaceChildren();

  if (friends.length === 0) {
    const emptyElement = document.createElement("p");

    emptyElement.className = "friend-invite-empty";
    emptyElement.textContent = "Friends appear here after you play games together.";
    friendInviteList.append(emptyElement);
    return;
  }

  friends.slice(0, 12).forEach((friend) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const name = document.createElement("span");
    const recency = document.createElement("span");

    label.className = "friend-invite-option";
    checkbox.type = "checkbox";
    checkbox.className = "friend-invite-checkbox";
    checkbox.value = friend.key;
    checkbox.dataset.friendName = friend.name;
    checkbox.dataset.friendProvider = friend.provider;
    checkbox.addEventListener("change", syncSelectedFriendSlots);
    name.className = "friend-invite-name";
    name.textContent = friend.name;
    recency.className = "friend-invite-recency";
    recency.textContent = formatFriendRecency(friend.lastPlayedAt);
    label.append(checkbox, name, recency);
    friendInviteList.append(label);
  });
}

function getSelectedFriendInvites() {
  return Array.from(document.querySelectorAll("#friend-invite-list .friend-invite-checkbox:checked"))
    .map((checkbox) => ({
      key: checkbox.value,
      name: normalizePlayerName(checkbox.dataset.friendName),
      provider: String(checkbox.dataset.friendProvider || "")
    }))
    .filter((friend) => friend.name);
}

function getSetupSlotRows() {
  return Array.from(document.querySelectorAll("#player-name-list .player-name-row"));
}

function setSlotRowToGuest(row, index) {
  const input = row?.querySelector(".player-name-input");

  if (!row || !input || index === 0) {
    return;
  }

  row.dataset.friendKey = "";
  row.dataset.friendProvider = "";
  row.dataset.slotType = "guest";
  row.classList.add("guest");
  input.value = "Guest";
}

function setSlotRowToFriend(row, friend) {
  const input = row?.querySelector(".player-name-input");

  if (!row || !input) {
    return;
  }

  row.dataset.friendKey = friend.key;
  row.dataset.friendProvider = friend.provider;
  row.dataset.slotType = "friend";
  row.classList.remove("guest");
  input.value = friend.name;
}

function syncSelectedFriendSlots() {
  const playerNameList = document.querySelector("#player-name-list");

  if (!playerNameList) {
    return;
  }

  const selectedFriends = getSelectedFriendInvites();
  const selectedFriendByKey = new Map(selectedFriends.map((friend) => [friend.key, friend]));
  const assignedFriendKeys = new Set();

  while (getSetupSlotRows().length < Math.min(maxPlayerSlots, Math.max(2, selectedFriends.length + 1))) {
    playerNameList.append(createPlayerNameRow("Guest", getSetupSlotRows().length, { guest: true }));
  }

  let rows = getSetupSlotRows();

  rows.slice(1).forEach((row, index) => {
    const friendKey = String(row.dataset.friendKey || "");
    const selectedFriend = selectedFriendByKey.get(friendKey);

    if (!friendKey) {
      return;
    }

    if (selectedFriend && !assignedFriendKeys.has(friendKey)) {
      setSlotRowToFriend(row, selectedFriend);
      assignedFriendKeys.add(friendKey);
    } else {
      setSlotRowToGuest(row, index + 1);
    }
  });

  selectedFriends
    .filter((friend) => !assignedFriendKeys.has(friend.key))
    .forEach((friend) => {
      rows = getSetupSlotRows();
      let guestRow = rows.slice(1).find((row) => !row.dataset.friendKey);

      if (!guestRow && getSetupSlotRows().length < maxPlayerSlots) {
        guestRow = createPlayerNameRow("Guest", rows.length, { guest: true });
        playerNameList.append(guestRow);
      }

      if (!guestRow) {
        const checkbox = Array.from(document.querySelectorAll("#friend-invite-list .friend-invite-checkbox"))
          .find((candidate) => candidate.value === friend.key);

        if (checkbox) {
          checkbox.checked = false;
        }
        return;
      }

      setSlotRowToFriend(guestRow, friend);
      assignedFriendKeys.add(friend.key);
    });

  updatePlayerRemoveButtons();
}

function createOpenPlayerSlot(index) {
  return {
    name: `Open Spot ${index + 1}`,
    claimed: false,
    open: true
  };
}

function createPlayerSetupEntries() {
  const auth = getStoredPlayerAuth();
  const hostName = getStoredPlayerName() || "Player 1";
  const rows = getSetupSlotRows();
  const entries = [
    {
      name: hostName,
      authKey: getStoredPlayerAuthKey(),
      provider: auth?.provider || "name",
      claimed: true,
      open: false
    }
  ];

  rows.slice(1, maxPlayerSlots).forEach((row) => {
    const input = row.querySelector(".player-name-input");
    const friendKey = String(row.dataset.friendKey || "");
    const name = normalizePlayerName(input?.value);

    if (friendKey && name) {
      entries.push({
        name,
        authKey: friendKey,
        provider: String(row.dataset.friendProvider || ""),
        claimed: true,
        open: false
      });
      return;
    }

    entries.push(createOpenPlayerSlot(entries.length));
  });

  while (entries.length < 2) {
    entries.push(createOpenPlayerSlot(entries.length));
  }

  return entries;
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
  return document.querySelector("input[name='game-length']:checked")?.value || "normal";
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

function validatePlayerSetupEntries(entries) {
  const claimedNames = (entries || [])
    .filter((entry) => entry.claimed !== false && !entry.open)
    .map((entry) => entry.name);
  const invitedNames = (entries || [])
    .filter((entry) => entry.invitedName)
    .map((entry) => entry.invitedName);

  return validatePlayerNames([...claimedNames, ...invitedNames]);
}

function stopGameListRefreshTimer() {
  window.clearInterval(gameListRefreshTimer);
  gameListRefreshTimer = null;
}

function startGameListRefreshTimer() {
  if (gameListRefreshTimer || !document.body.classList.contains("screen-list")) {
    return;
  }

  gameListRefreshTimer = window.setInterval(() => {
    if (!document.body.classList.contains("screen-list") || document.hidden || loadingActiveGames) {
      return;
    }

    void loadActiveGames();
  }, gameListRefreshMilliseconds);
}

function updateGameListRefreshTimer() {
  if (document.body.classList.contains("screen-list")) {
    startGameListRefreshTimer();
  } else {
    stopGameListRefreshTimer();
  }
}

function setScreen(screenName, options = {}) {
  const shouldClearGameURL = options.clearGameURL !== false;

  if (screenName !== "play") {
    window.clearTimeout(immediateTurnRefreshTimer);
    immediateTurnRefreshTimer = null;
  }

  document.body.classList.remove("screen-welcome", "screen-display-name", "screen-setup", "screen-list", "screen-play", "screen-rules");
  document.body.classList.add(`screen-${screenName}`);

  if (screenName !== "play") {
    document.body.classList.remove("game-over");
    setConcedeConfirmationVisible(false);
  }

  if (screenName !== "play" && shouldClearGameURL) {
    clearGameURLGameId();
  }

  closeIdentityMenu();
  updateTurnPolling();
  updateGameListRefreshTimer();
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
    const otherPlayerNames = gameState.players.slice(1)
      .map((player) => player.name)
      .filter((name) => !/^player \d+$/i.test(normalizePlayerName(name)));

    renderPlayerNameInputs([
      getStoredPlayerName(),
      ...(otherPlayerNames.length > 0 ? otherPlayerNames : ["Guest"])
    ]);
    renderFriendInviteOptions();
    syncSelectedFriendSlots();
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
  if (!isLegacyNameLoginAllowed()) {
    setGameMessage("Use Google or Facebook to sign in.");
    return;
  }

  const identityNameInput = document.querySelector("#identity-name-input");
  const playerName = setStoredPlayerAuth({
    provider: "name",
    name: identityNameInput?.value
  })?.name;

  if (!playerName) {
    setGameMessage("Enter your name first.");
    identityNameInput?.focus();
    return;
  }

  void finishIdentitySignIn();
}

function clearDisallowedLegacyNameLogin() {
  if (isLegacyNameLoginAllowed()) {
    return;
  }

  const auth = parseJSONStorageItem(playerAuthStorageKey, null);
  const provider = String(auth?.provider || (auth ? "name" : ""));

  if (!auth || provider === "name") {
    deleteCookie(playerNameCookie);
    removeLocalStorageItem(playerNameStorageKey);
    removeLocalStorageItem(playerAuthStorageKey);
  }
}

function logoutPlayer() {
  deleteCookie(playerNameCookie);
  removeLocalStorageItem(playerNameStorageKey);
  removeLocalStorageItem(playerAuthStorageKey);
  pendingIdentityAction = null;
  closeIdentityMenu();
  setWaitingGamesForMenu([]);
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
  const auth = getStoredPlayerAuth();
  const params = new URLSearchParams({
    action: "save",
    authKey: getStoredPlayerAuthKey(),
    sessionToken: auth?.sessionToken || ""
  });
  const payload = await fetchJSON(`${serverURL}?${params.toString()}`, {
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

  rememberFriendsFromGame(gameState.toJSON());
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
    const params = new URLSearchParams({
      action: "load",
      id: gameState.id,
      turnIndex: String(gameState.turnIndex),
      playerName: getStoredPlayerName(),
      authKey: getStoredPlayerAuthKey()
    });
    const payload = await fetchJSON(
      `${serverURL}?${params.toString()}`
    );

    setWaitingGamesForMenu(payload.waitingGames || [], { trusted: true });

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
  if (document.body.classList.contains("screen-list")) {
    updateGameListRefreshTimer();

    if (!document.hidden) {
      void loadActiveGames();
    }
  }

  if (!document.body.classList.contains("screen-play")) {
    window.clearTimeout(immediateTurnRefreshTimer);
    immediateTurnRefreshTimer = null;
    updateTurnPolling();
    return;
  }

  window.clearTimeout(immediateTurnRefreshTimer);
  immediateTurnRefreshTimer = window.setTimeout(() => {
    updateTurnPolling();

    if (!document.hidden && document.body.classList.contains("screen-play")) {
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

function getGameListConcededPlayerKeys(game) {
  const concededNames = [
    ...(Array.isArray(game?.concededByPlayerNames) ? game.concededByPlayerNames : []),
    game?.concededByPlayerName || ""
  ];

  return new Set(concededNames.map(normalizeNameKey).filter(Boolean));
}

function getGameListVictorResult(players, concededByPlayerName = "", concededByPlayerNames = []) {
  const concededPlayerKeys = new Set([
    ...(Array.isArray(concededByPlayerNames) ? concededByPlayerNames : []),
    concededByPlayerName
  ].map(normalizeNameKey).filter(Boolean));
  const scoredPlayers = (players || [])
    .filter((player) => !concededPlayerKeys.has(normalizeNameKey(player.name)))
    .filter((player) => Number.isFinite(Number(player.score)));

  if (scoredPlayers.length === 0) {
    return null;
  }

  const highScore = Math.max(...scoredPlayers.map((player) => Number(player.score)));

  return {
    highScore,
    leaders: scoredPlayers.filter((player) => Number(player.score) === highScore)
  };
}

function getGameListPoolRemaining(game) {
  const explicitRemaining = Number(game?.tilesRemaining);

  if (Number.isFinite(explicitRemaining)) {
    return Math.max(0, explicitRemaining);
  }

  if (game?.lettersAvailable && typeof game.lettersAvailable === "object") {
    return Object.values(game.lettersAvailable)
      .reduce((total, count) => total + Math.max(0, Number(count || 0)), 0);
  }

  try {
    const listGameState = new WordWefterGameState();

    listGameState.loadFromJSON(game);
    return listGameState.tilesRemaining;
  } catch (error) {
    return null;
  }
}

function gameBelongsToStoredPlayer(game) {
  const storedPlayerKey = normalizeNameKey(getStoredPlayerName());
  const authKey = getStoredPlayerAuthKey();

  if (!storedPlayerKey && !authKey) {
    return false;
  }

  return (game.players || []).some((player) => (
    player.claimed !== false &&
    !player.open &&
    (
      normalizeNameKey(player.name) === storedPlayerKey ||
      (authKey && String(player.authKey || "") === authKey)
    )
  )) || (game.playerNames || []).some((name) => normalizeNameKey(name) === storedPlayerKey);
}

function gameIsWaitingForStoredPlayer(game) {
  const storedPlayerKey = normalizeNameKey(getStoredPlayerName());
  const concededPlayerKeys = getGameListConcededPlayerKeys(game);

  return Boolean(
    storedPlayerKey &&
    !concededPlayerKeys.has(storedPlayerKey) &&
    !game.gameOver &&
    normalizeNameKey(game.currentPlayerName) === storedPlayerKey &&
    gameBelongsToStoredPlayer(game)
  );
}

function setWaitingGamesForMenu(games, options = {}) {
  waitingGamesForMenu = (Array.isArray(games) ? games : [])
    .filter((game) => options.trusted === true || gameIsWaitingForStoredPlayer(game))
    .sort((firstGame, secondGame) => getGameListTouchedTime(secondGame) - getGameListTouchedTime(firstGame))
    .slice(0, 5);
  renderWaitingGamesMenu();
}

async function refreshWaitingGamesForMenu() {
  const playerName = getStoredPlayerName();

  if (!playerName) {
    setWaitingGamesForMenu([]);
    return;
  }

  try {
    if (/^[A-Z0-9]{5}$/.test(gameState.id)) {
      const params = new URLSearchParams({
        action: "load",
        id: gameState.id,
        turnIndex: String(gameState.turnIndex),
        playerName,
        authKey: getStoredPlayerAuthKey()
      });
      const payload = await fetchJSON(`${serverURL}?${params.toString()}`);

      setWaitingGamesForMenu(payload.waitingGames || [], { trusted: true });
      return;
    }

    const payload = await fetchJSON(`${serverURL}?action=list`);

    setWaitingGamesForMenu(payload.games || []);
  } catch {
    // Keep the last successful badge state instead of flashing it away on a transient refresh failure.
  }
}

function renderWaitingGamesMenu() {
  const menuButton = document.querySelector("#identity-menu-button");
  const notificationCount = document.querySelector("#menu-notification-count");
  const waitingGamesElement = document.querySelector("#menu-waiting-games");
  const count = waitingGamesForMenu.length;

  if (menuButton) {
    menuButton.classList.toggle("has-notifications", count > 0);
  }

  if (notificationCount) {
    notificationCount.textContent = count > 0 ? "!" : "";
  }

  if (!waitingGamesElement) {
    return;
  }

  waitingGamesElement.replaceChildren();
  waitingGamesElement.classList.toggle("has-games", count > 0);

  if (count === 0) {
    return;
  }

  const title = document.createElement("p");

  title.className = "menu-waiting-title";
  title.textContent = "Your Turn";
  waitingGamesElement.append(title);

  waitingGamesForMenu.forEach((game) => {
    const button = document.createElement("button");
    const idElement = document.createElement("span");
    const turnElement = document.createElement("span");

    button.className = "game-button secondary menu-waiting-game";
    button.type = "button";
    button.dataset.gameId = game.id;
    idElement.className = "menu-waiting-game-id";
    idElement.textContent = game.id;
    turnElement.className = "menu-waiting-game-turn";
    turnElement.textContent = `Turn ${getTurnDisplayNumber(game.turnIndex)}`;
    button.append(idElement, turnElement);
    button.addEventListener("click", () => {
      closeIdentityMenu();
      resumeGame(game.id);
    });
    waitingGamesElement.append(button);
  });
}

function claimGameSpot(sourceGameState, auth) {
  if (!sourceGameState || !auth?.name) {
    return false;
  }

  const authKey = getStoredPlayerAuthKey();
  const playerNameKey = normalizeNameKey(auth.name);
  const players = Array.isArray(sourceGameState.players) ? sourceGameState.players : [];
  const reservedIndex = players.findIndex((player) => (
    (player.open || player.claimed === false) &&
    (
      (player.invitedName && normalizeNameKey(player.invitedName) === playerNameKey) ||
      (authKey && String(player.authKey || "") === authKey)
    )
  ));
  const openIndex = players.findIndex((player) => (
    player.open ||
    player.claimed === false ||
    /^open spot \d+$/i.test(String(player.name || ""))
  ));
  const claimIndex = reservedIndex !== -1 ? reservedIndex : openIndex;

  if (claimIndex === -1) {
    return false;
  }

  players[claimIndex] = {
    ...players[claimIndex],
    name: auth.name,
    authKey,
    provider: auth.provider,
    claimed: true,
    open: false
  };
  delete players[claimIndex].invitedName;
  sourceGameState.players = players;
  return true;
}

async function loadActiveGames() {
  const activeGamesList = document.querySelector("#active-games-list");
  const storedPlayerName = getStoredPlayerName();

  if (loadingActiveGames) {
    return;
  }

  if (!activeGamesList) {
    return;
  }

  if (!storedPlayerName) {
    activeGamesList.textContent = "";
    setWaitingGamesForMenu([]);
    return;
  }

  loadingActiveGames = true;

  try {
    const payload = await fetchJSON(`${serverURL}?action=list`);
    (payload.games || []).forEach((game) => rememberFriendsFromGame(game));
    setWaitingGamesForMenu(payload.games || []);
    const matchingGames = (payload.games || [])
      .filter(gameBelongsToStoredPlayer)
      .map((game) => ({
        ...game,
        isWaitingForStoredPlayer: gameIsWaitingForStoredPlayer(game)
      }))
      .sort((firstGame, secondGame) => {
        if (Boolean(firstGame.gameOver) !== Boolean(secondGame.gameOver)) {
          return firstGame.gameOver ? 1 : -1;
        }

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

    const gameGroups = [
      {
        title: "Your Turn",
        games: matchingGames.filter((game) => game.isWaitingForStoredPlayer)
      },
      {
        title: "Waiting",
        games: matchingGames.filter((game) => !game.gameOver && !game.isWaitingForStoredPlayer)
      },
      {
        title: "Completed Games",
        games: matchingGames.filter((game) => game.gameOver)
      }
    ];

    gameGroups.forEach((group) => {
      if (group.games.length === 0) {
        return;
      }

      const groupElement = document.createElement("section");
      const groupHeading = document.createElement("h3");

      groupElement.className = "active-games-group";
      groupHeading.className = "active-games-group-title";
      groupHeading.textContent = group.title;
      groupElement.append(groupHeading);

      group.games.forEach((game) => {
        const row = document.createElement("div");
        const idElement = document.createElement("span");
        const gameCodeElement = document.createElement("span");
        const detailsElement = document.createElement("div");
        const playersElement = document.createElement("div");
        const turnElement = document.createElement("span");
        const poolElement = document.createElement("span");
        const resumeButton = document.createElement("button");
        const playerSummaries = getGameListPlayerSummaries(game);
        const poolRemaining = getGameListPoolRemaining(game);
        const concededPlayerKeys = getGameListConcededPlayerKeys(game);
        const victorResult = game.gameOver ? getGameListVictorResult(playerSummaries, game.concededByPlayerName, game.concededByPlayerNames) : null;
        const victorNameKeys = new Set((victorResult?.leaders || []).map((player) => normalizeNameKey(player.name)));

        row.className = "active-game-row";
        row.classList.toggle("waiting-player", game.isWaitingForStoredPlayer);
        row.classList.toggle("completed-game", Boolean(game.gameOver));
        row.dataset.gameId = game.id;
        idElement.className = "active-game-id";
        gameCodeElement.textContent = game.id;
        detailsElement.className = "active-game-details";
        playersElement.className = "active-game-player-list";
        turnElement.className = "active-game-turn";
        poolElement.className = "active-game-pool";
        resumeButton.className = "game-button secondary";
        resumeButton.type = "button";
        idElement.append(gameCodeElement, turnElement, poolElement);
        playerSummaries.forEach((player) => {
          const playerElement = document.createElement("span");
          const playerNameElement = document.createElement("span");
          const playerPointsElement = document.createElement("span");

          playerElement.className = "active-game-player-score";
          playerElement.classList.toggle("current-player", !game.gameOver && normalizeNameKey(player.name) === normalizeNameKey(game.currentPlayerName));
          playerElement.classList.toggle("winner-player", Boolean(game.gameOver && victorNameKeys.has(normalizeNameKey(player.name))));
          playerElement.classList.toggle("conceded-player", concededPlayerKeys.has(normalizeNameKey(player.name)));
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
        turnElement.textContent = `Turn ${getTurnDisplayNumber(game.turnIndex)}`;
        poolElement.textContent = Number.isFinite(poolRemaining) ? `Pool ${poolRemaining}` : "Pool --";

        resumeButton.textContent = game.gameOver ? "View" : "Resume";
        resumeButton.addEventListener("click", () => resumeGame(game.id));

        detailsElement.append(playersElement);
        row.append(idElement, detailsElement, resumeButton);
        groupElement.append(row);
      });

      activeGamesList.append(groupElement);
    });
  } catch (error) {
    activeGamesList.textContent = `Could not load active games: ${error.message}`;
  } finally {
    loadingActiveGames = false;
  }
}

async function loadGameById(gameId) {
  const normalizedGameId = String(gameId || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{5}$/.test(normalizedGameId)) {
    throw new Error("Game ID must be a 5 character letter/number string.");
  }

  const params = new URLSearchParams({
    action: "load",
    id: normalizedGameId,
    playerName: getStoredPlayerName(),
    authKey: getStoredPlayerAuthKey()
  });
  const payload = await fetchJSON(`${serverURL}?${params.toString()}`);
  const storedPlayerKey = normalizeNameKey(getStoredPlayerName());
  const auth = getStoredPlayerAuth();
  const authKey = getStoredPlayerAuthKey();
  const players = payload.gameState.players || [];
  const canPlayGame = players
    .some((player) => (
      player.claimed !== false &&
      !player.open &&
      (
        normalizeNameKey(player.name) === storedPlayerKey ||
        (authKey && String(player.authKey || "") === authKey)
      )
    ));

  if (!canPlayGame && !claimGameSpot(payload.gameState, auth)) {
    throw new Error("This game does not include your player name.");
  }

  gameState.loadFromJSON(payload.gameState);
  rememberFriendsFromGame(gameState.toJSON());
  captureTurnStartGameState();
  setScreen("play");
  setGameURLGameId(gameState.id);
  setGameMessage("");
  renderGame();
  setWaitingGamesForMenu(payload.waitingGames || [], { trusted: true });

  if (!canPlayGame) {
    await saveGameState();
    setGameMessage(`Claimed a spot in game ${gameState.id}.`);
  }
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
  const playerEntries = createPlayerSetupEntries();
  const validationMessage = validatePlayerSetupEntries(playerEntries);

  if (!getStoredPlayerName()) {
    showNewGameSetup();
    return;
  }

  if (validationMessage) {
    setGameMessage(validationMessage);
    return;
  }

  gameState.players = gameState.normalizePlayers(playerEntries);
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
  setPassConfirmationVisible(false);
  setConcedeConfirmationVisible(false);
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

  const redrawExitMilliseconds = animateRackRedrawExit();
  gameState.redrawCurrentRack();
  gameState.recordRedrawTurnHistory();

  gameState.advanceTurn();
  gameState.advanceTurnIndex();
  captureTurnStartGameState();
  setGameMessage("");
  await wait(redrawExitMilliseconds);
  renderGame({ rackRedrawEnter: true });

  try {
    await saveGameState();
    await loadActiveGames();
  } catch (error) {
    setGameMessage(`Tiles redrawn, but could not save: ${error.message}`);
  }
}

async function passTurn() {
  if (!document.body.classList.contains("screen-play")) {
    showNewGameSetup();
    return;
  }

  if (!isMyTurn() || gameState.gameOver) {
    return;
  }

  setGameMessage("");
  setRedrawConfirmationVisible(false);
  setConcedeConfirmationVisible(false);
  setPassConfirmationVisible(true);
}

async function confirmPassTurn() {
  if (!document.body.classList.contains("screen-play")) {
    showNewGameSetup();
    return;
  }

  if (!isMyTurn() || gameState.gameOver) {
    setPassConfirmationVisible(false);
    return;
  }

  if (gameState.hasActivePlacements() || gameState.hasPendingMarketplacePurchases()) {
    setPassConfirmationVisible(false);
    setGameMessage("Reset placed tiles before passing.");
    return;
  }

  setRedrawConfirmationVisible(false);
  setPassConfirmationVisible(false);

  const advanceResult = gameState.passTurn();

  gameState.advanceTurnIndex();
  captureTurnStartGameState();
  setGameMessage("");
  renderGame({ rackRedrawEnter: advanceResult.drawnTiles.length > 0 });

  try {
    await saveGameState();
    await loadActiveGames();
  } catch (error) {
    setGameMessage(`Turn passed, but could not save: ${error.message}`);
  }
}

function concedeGame() {
  if (!document.body.classList.contains("screen-play") || gameState.gameOver || !getLoggedInPlayer()) {
    return;
  }

  setRedrawConfirmationVisible(false);
  setPassConfirmationVisible(false);
  setConcedeConfirmationVisible(true);
}

async function confirmConcedeGame() {
  const playerName = getStoredPlayerName();

  if (!document.body.classList.contains("screen-play") || gameState.gameOver || !getLoggedInPlayer()) {
    setConcedeConfirmationVisible(false);
    return;
  }

  if (!gameState.concedeGame(playerName)) {
    setConcedeConfirmationVisible(false);
    return;
  }

  gameState.advanceTurnIndex();
  captureTurnStartGameState();
  setConcedeConfirmationVisible(false);
  setGameMessage("");
  renderGame();

  try {
    await saveGameState();
    await loadActiveGames();
  } catch (error) {
    setGameMessage(`Game conceded, but could not save: ${error.message}`);
  }
}

function cancelRedrawTiles() {
  setRedrawConfirmationVisible(false);
}

function cancelPassTurn() {
  setPassConfirmationVisible(false);
}

function cancelConcedeGame() {
  setConcedeConfirmationVisible(false);
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
    setGameMessage("");
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
  setPassConfirmationVisible(false);
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

  if (isOpen) {
    refreshWaitingGamesForMenu();
  }
}

function closeIdentityMenuOnOutsideClick(event) {
  if (!document.body.classList.contains("menu-open")) {
    return;
  }

  const identityMenu = document.querySelector("#identity-menu");
  const identityMenuButton = document.querySelector("#identity-menu-button");
  const target = event.target;

  if (
    identityMenu?.contains(target) ||
    identityMenuButton?.contains(target)
  ) {
    return;
  }

  closeIdentityMenu();
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
  const googleLoginButton = document.querySelector("#google-login-button");
  const facebookLoginButton = document.querySelector("#facebook-login-button");
  const identityNameInput = document.querySelector("#identity-name-input");
  const oauthDisplayNameInput = document.querySelector("#oauth-display-name-input");
  const saveOAuthDisplayNameButton = document.querySelector("#save-oauth-display-name-button");
  const identityMenuButton = document.querySelector("#identity-menu-button");
  const logoutButton = document.querySelector("#logout-button");
  const showNewGameButton = document.querySelector("#show-new-game-button");
  const showGameListButton = document.querySelector("#show-game-list-button");
  const showRulesButton = document.querySelector("#show-rules-button");
  const notificationToggleCheckbox = document.querySelector("#notification-toggle-checkbox");
  const createGameFromListButton = document.querySelector("#create-game-from-list-button");
  const createGameButton = document.querySelector("#create-game-button");
  const addPlayerButton = document.querySelector("#add-player-button");
  const copyInviteLinkButton = document.querySelector("#copy-invite-link-button");
  const shuffleRackButton = document.querySelector("#shuffle-rack-button");
  const redrawTilesButton = document.querySelector("#redraw-tiles-button");
  const passTurnButton = document.querySelector("#pass-turn-button");
  const viewPoolButton = document.querySelector("#view-pool-button");
  const confirmRedrawButton = document.querySelector("#confirm-redraw-button");
  const cancelRedrawButton = document.querySelector("#cancel-redraw-button");
  const confirmPassButton = document.querySelector("#confirm-pass-button");
  const cancelPassButton = document.querySelector("#cancel-pass-button");
  const concedeGameButton = document.querySelector("#concede-game-button");
  const confirmConcedeButton = document.querySelector("#confirm-concede-button");
  const cancelConcedeButton = document.querySelector("#cancel-concede-button");
  const finishPlacementButton = document.querySelector("#finish-placement-button");
  const resetPlacementButton = document.querySelector("#reset-placement-button");

  if (saveIdentityButton) {
    saveIdentityButton.addEventListener("click", saveIdentityFromInput);
  }

  if (googleLoginButton) {
    googleLoginButton.addEventListener("click", () => {
      void startOAuthLogin("google");
    });
  }

  if (facebookLoginButton) {
    facebookLoginButton.addEventListener("click", () => {
      void startOAuthLogin("facebook");
    });
  }

  if (identityNameInput) {
    identityNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        saveIdentityFromInput();
      }
    });
  }

  if (saveOAuthDisplayNameButton) {
    saveOAuthDisplayNameButton.addEventListener("click", saveOAuthDisplayName);
  }

  if (oauthDisplayNameInput) {
    oauthDisplayNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveOAuthDisplayName();
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logoutPlayer);
  }

  if (identityMenuButton) {
    identityMenuButton.addEventListener("click", toggleIdentityMenu);
  }

  document.addEventListener("click", closeIdentityMenuOnOutsideClick);

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
      const input = addPlayerNameInput("Guest");

      input?.focus();
    });
  }

  if (copyInviteLinkButton) {
    copyInviteLinkButton.addEventListener("click", copyInviteLink);
  }

  if (redrawTilesButton) {
    redrawTilesButton.addEventListener("click", redrawTilesAndSkipTurn);
  }

  if (passTurnButton) {
    passTurnButton.addEventListener("click", passTurn);
  }

  if (viewPoolButton) {
    viewPoolButton.addEventListener("click", () => {
      showingPoolView = !showingPoolView;
      renderScore();
    });
  }

  if (confirmRedrawButton) {
    confirmRedrawButton.addEventListener("click", confirmRedrawTilesAndSkipTurn);
  }

  if (cancelRedrawButton) {
    cancelRedrawButton.addEventListener("click", cancelRedrawTiles);
  }

  if (confirmPassButton) {
    confirmPassButton.addEventListener("click", confirmPassTurn);
  }

  if (cancelPassButton) {
    cancelPassButton.addEventListener("click", cancelPassTurn);
  }

  if (concedeGameButton) {
    concedeGameButton.addEventListener("click", concedeGame);
  }

  if (confirmConcedeButton) {
    confirmConcedeButton.addEventListener("click", confirmConcedeGame);
  }

  if (cancelConcedeButton) {
    cancelConcedeButton.addEventListener("click", cancelConcedeGame);
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
  clearDisallowedLegacyNameLogin();
  await loadOAuthConfig();
  await completeOAuthRedirectIfPresent();
  if (getPendingOAuthDisplayAuth()) {
    showOAuthDisplayNamePage();
    bindGameControls();
    return;
  }
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
window.passWordWefterTurn = passTurn;
window.confirmWordWefterPass = confirmPassTurn;
window.concedeWordWefterGame = concedeGame;
window.confirmWordWefterConcede = confirmConcedeGame;
window.finishWordWefterPlacement = finishPlacement;
window.resetWordWefterPlacement = resetPlacement;

export { WordWefterGameState, gameState };
