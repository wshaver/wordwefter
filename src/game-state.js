import {
  bonusTypes,
  gameLengthSettings,
  wildcardLetter,
  playableLetters,
  rackRainbowProbability,
  boardSize,
  startCell,
  isVowelLetter,
  normalizeGameLength,
  createLettersAvailableForGameLength,
  dictionaryWordSet,
  letter_points
} from "./game-config.js";

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
    this.finalTurnsRemaining = Number.isInteger(Number(setup.finalTurnsRemaining))
      ? Math.max(0, Number(setup.finalTurnsRemaining))
      : null;
    this.pendingFinalRound = Boolean(setup.pendingFinalRound);
    this.marketplaceClosed = Boolean(setup.marketplaceClosed);
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

  hasPlayerCompletedTurn(playerIndex = this.currentPlayerIndex) {
    const player = this.players[playerIndex];
    const playerKey = normalizeNameKey(player?.name);

    if (!playerKey) {
      return false;
    }

    return this.history.some((entry) => normalizeNameKey(entry?.playerName) === playerKey);
  }

  shouldShowMarketplaceOpeningSoon(playerIndex = this.currentPlayerIndex) {
    return !this.gameOver &&
      !this.marketplaceClosed &&
      !this.hasPlayerCompletedTurn(playerIndex);
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

    if (this.isFinalRoundActive() && !this.pendingFinalRound && this.finalTurnsRemaining <= 1) {
      this.gameOver = true;
      this.pendingFinalRound = false;
      this.finalTurnsRemaining = 0;
      return result;
    }

    if (this.getActivePlayers().length <= 1) {
      this.gameOver = true;
      this.pendingFinalRound = false;
      this.finalTurnsRemaining = null;
      return result;
    }

    this.advanceMarketplaceTurn();
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
      this.advanceMarketplaceTurn();
      this.currentPlayerIndex = this.getNextActivePlayerIndex(playerIndex);

      if (this.currentRack.length === 0) {
        this.drawSevenTiles();
      }
    }

    return true;
  }

  advanceTurnIndex() {
    this.turnIndex += 1;

    if (this.gameOver || !this.isFinalRoundActive()) {
      return;
    }

    if (this.pendingFinalRound) {
      this.pendingFinalRound = false;
      return;
    }

    this.finalTurnsRemaining = Math.max(0, this.finalTurnsRemaining - 1);

    if (this.finalTurnsRemaining === 0) {
      this.gameOver = true;
    }
  }

  drawTiles(tileCount = 7, options = {}) {
    if (!Number.isInteger(tileCount) || tileCount < 0) {
      throw new Error("tileCount must be a non-negative integer.");
    }

    const drawnTiles = [];

    while (drawnTiles.length < tileCount) {
      if (this.tilesRemaining === 0) {
        const returnedTileCount = this.closeMarketplaceIntoPool();

        if (returnedTileCount === 0 && this.tilesRemaining === 0) {
          this.beginFinalRound();
          break;
        }
      }

      if (this.tilesRemaining === 0) {
        break;
      }

      const shouldForceNonWildcard = Boolean(options.ensureRainbow) &&
        drawnTiles.length === tileCount - 1 &&
        !drawnTiles.some((drawnTile) => !drawnTile.wildcard) &&
        this.hasAvailableMarketplaceLetters();
      const tile = this.drawTile({
        excludeWildcards: shouldForceNonWildcard,
        rackBalanceTiles: [
          ...this.currentRack,
          ...drawnTiles
        ]
      });

      if (tile) {
        drawnTiles.push(this.prepareRackDrawnTile(tile, {
          suppressRandomRainbow: Boolean(options.ensureRainbow)
        }));

        if (this.tilesRemaining === 0 && !this.marketplaceTiles.some(Boolean)) {
          this.beginFinalRound();
        }
      } else {
        break;
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

  drawMarketplaceTiles(tileCount = 7, options = {}) {
    const drawnTiles = [];
    const refillExcludeLetters = options.excludeLetters instanceof Set
      ? options.excludeLetters
      : new Set(Array.isArray(options.excludeLetters) ? options.excludeLetters : []);

    if (this.marketplaceClosed) {
      return drawnTiles;
    }

    while (
      (this.marketplaceTiles.length < tileCount || this.marketplaceTiles.some((tile) => !tile)) &&
      this.tilesRemaining > 0 &&
      this.hasAvailableMarketplaceLetters()
    ) {
      const duplicateLetters = this.getMarketplaceDuplicateDrawLetters();
      const excludedDuplicateLetters = this.hasAvailableMarketplaceLetters(duplicateLetters)
        ? duplicateLetters
        : new Set();
      const excludedLetters = new Set([
        ...excludedDuplicateLetters,
        ...refillExcludeLetters
      ]);
      const tile = this.drawTile({
        excludeLetters: excludedLetters,
        excludeWildcards: true
      });

      if (!tile) {
        break;
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

  advanceMarketplaceTurn(tileCount = Math.max(7, this.marketplaceTiles.length)) {
    if (this.marketplaceClosed) {
      return null;
    }

    const remainingTiles = this.marketplaceTiles.filter(Boolean);
    const expiredTile = remainingTiles.shift() || null;
    const refillExcludeLetters = new Set();

    if (expiredTile) {
      const expiredLetter = String(expiredTile.sourceLetter || expiredTile.letter || "").toUpperCase();

      this.returnTileToAvailableLetters(expiredTile, { restoreDrawCount: true });
      if (expiredLetter) {
        refillExcludeLetters.add(expiredLetter);
      }
    }

    this.marketplaceTiles = remainingTiles;
    this.drawMarketplaceTiles(tileCount, { excludeLetters: refillExcludeLetters });
    return expiredTile;
  }

  getMarketplaceDuplicateDrawLetters() {
    return new Set(this.marketplaceTiles
      .filter(Boolean)
      .map((tile) => String(tile.letter || "").toUpperCase())
      .filter((letter) => playableLetters.includes(letter)));
  }

  reconcileMarketplaceDuplicateLetters() {
    const seenLetters = new Set();

    this.marketplaceTiles = this.marketplaceTiles.map((tile) => {
      const letter = String(tile?.sourceLetter || tile?.letter || "").toUpperCase();

      if (!playableLetters.includes(letter)) {
        return tile;
      }

      if (!seenLetters.has(letter)) {
        seenLetters.add(letter);
        return tile;
      }

      if (!this.hasAvailableMarketplaceLetters(seenLetters)) {
        return tile;
      }

      this.returnTileToAvailableLetters(tile, { restoreDrawCount: true });
      const replacementTile = this.drawTile({
        excludeLetters: seenLetters,
        excludeWildcards: true
      });

      if (!replacementTile) {
        seenLetters.add(letter);
        return tile;
      }

      seenLetters.add(String(replacementTile.letter || "").toUpperCase());
      return replacementTile;
    });
  }

  hasAvailableMarketplaceLetters(excludeLetters = new Set()) {
    return playableLetters.some((letter) => (
      !excludeLetters.has(letter) &&
      Math.max(0, Number(this.lettersAvailable[letter] || 0)) > 0
    ));
  }

  isFinalRoundActive() {
    return Number.isInteger(this.finalTurnsRemaining) && this.finalTurnsRemaining > 0;
  }

  isCurrentPlayerLastTurn() {
    return !this.gameOver &&
      this.isFinalRoundActive() &&
      !this.pendingFinalRound &&
      this.finalTurnsRemaining <= this.getActivePlayers().length;
  }

  beginFinalRound() {
    if (this.gameOver || this.isFinalRoundActive()) {
      return;
    }

    this.marketplaceClosed = true;
    this.pendingFinalRound = true;
    this.finalTurnsRemaining = Math.max(1, this.getActivePlayers().length);
  }

  closeMarketplaceIntoPool() {
    const returnedTiles = this.marketplaceTiles.filter(Boolean);

    if (this.marketplaceClosed) {
      return 0;
    }

    this.marketplaceClosed = true;
    this.marketplaceTiles = [];
    returnedTiles.forEach((tile) => {
      this.returnTileToAvailableLetters(tile, { restoreDrawCount: true });
    });

    return returnedTiles.length;
  }

  hasAvailableVowels(weightedLetters) {
    return weightedLetters.some(([letter]) => isVowelLetter(letter));
  }

  hasAvailableNonVowels(weightedLetters) {
    return weightedLetters.some(([letter]) => (
      playableLetters.includes(letter) &&
      !isVowelLetter(letter)
    ));
  }

  getRackVowelBalance(tiles = []) {
    return tiles.reduce((balance, tile) => {
      const letter = String(tile?.sourceLetter || tile?.letter || "").toUpperCase();

      if (!playableLetters.includes(letter)) {
        return balance;
      }

      if (isVowelLetter(letter)) {
        balance.vowels += 1;
      } else {
        balance.nonVowels += 1;
      }

      return balance;
    }, {
      vowels: 0,
      nonVowels: 0
    });
  }

  getRackBalanceDrawMultiplier(letter, rackBalance, weightedLetters) {
    if (!rackBalance || letter === wildcardLetter || !playableLetters.includes(letter)) {
      return 1;
    }

    const vowelCount = Math.max(0, Number(rackBalance.vowels || 0));
    const nonVowelCount = Math.max(0, Number(rackBalance.nonVowels || 0));

    if (vowelCount === nonVowelCount) {
      return 1;
    }

    const shouldFavorVowel = nonVowelCount > vowelCount;
    const favoredCategoryAvailable = shouldFavorVowel
      ? this.hasAvailableVowels(weightedLetters)
      : this.hasAvailableNonVowels(weightedLetters);

    if (!favoredCategoryAvailable) {
      return 1;
    }

    const isFavoredLetter = shouldFavorVowel
      ? isVowelLetter(letter)
      : !isVowelLetter(letter);

    return isFavoredLetter
      ? 1 + (Math.abs(nonVowelCount - vowelCount) * 0.1)
      : 1;
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

  getMarketplaceTileCost(tileIdOrTile = "") {
    const tileId = typeof tileIdOrTile === "object"
      ? String(tileIdOrTile?.id || "")
      : String(tileIdOrTile || "");
    const tileIndex = this.marketplaceTiles.findIndex((tile) => tile?.id === tileId);

    return tileIndex === -1 ? null : tileIndex + 1;
  }

  getMarketplaceTileCosts() {
    return this.marketplaceTiles.map((tile, index) => (
      tile ? index + 1 : null
    ));
  }

  canBuyTile(tileId) {
    const tile = this.marketplaceTiles.find((marketplaceTile) => marketplaceTile?.id === tileId);
    const marketplaceCost = this.getMarketplaceTileCost(tileId);

    return Boolean(tile) &&
      Number.isFinite(marketplaceCost) &&
      this.currentScore >= marketplaceCost;
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
    const marketplaceCost = this.getMarketplaceTileCost(tile.id);

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

    const pendingTiles = this.getPendingMarketplaceTiles();
    const pendingCost = pendingTiles.reduce((total, tile) => (
      total + Math.max(0, Number(tile.marketplaceCost || 0))
    ), 0);

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
    const excludeLetters = options.excludeLetters instanceof Set
      ? options.excludeLetters
      : new Set(Array.isArray(options.excludeLetters) ? options.excludeLetters : []);
    const weightedLetters = Object.entries(this.lettersAvailable)
      .filter(([letter, count]) => (
        count > 0 &&
        (!options.excludeWildcards || letter !== wildcardLetter) &&
        !excludeLetters.has(letter)
      ));
    const rackBalance = Array.isArray(options.rackBalanceTiles)
      ? this.getRackVowelBalance(options.rackBalanceTiles)
      : null;
    const weightedDrawEntries = weightedLetters.map(([letter, count]) => [
      letter,
      Math.max(0, Number(count || 0)) * this.getRackBalanceDrawMultiplier(letter, rackBalance, weightedLetters)
    ]);
    const totalWeight = weightedDrawEntries.reduce((total, [, weight]) => total + weight, 0);

    if (totalWeight === 0) {
      return null;
    }

    let drawIndex = Math.random() * totalWeight;

    for (const [letter, weight] of weightedDrawEntries) {
      if (drawIndex < weight) {
        this.lettersAvailable[letter] -= 1;
        this.tilesDrawn += 1;

        return {
          id: `tile-${this.nextTileId++}`,
          letter,
          points: this.letterPoints[letter],
          ...(letter === wildcardLetter ? { wildcard: true } : {}),
        };
      }

      drawIndex -= weight;
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
    this.marketplaceClosed = false;
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
        if (!this.canPlaceBoardBonusAt(row, column)) {
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

        if (!this.canPlaceBoardBonusAt(row, column)) {
          continue;
        }

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

  canPlaceBoardBonusAt(row, column) {
    const normalizedRow = Number(row);
    const normalizedColumn = Number(column);

    return Number.isInteger(normalizedRow) &&
      Number.isInteger(normalizedColumn) &&
      normalizedRow !== startCell.row &&
      normalizedColumn !== startCell.column;
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
      ...(this.marketplaceClosed ? { marketplaceClosed: true } : {}),
      ...(this.isFinalRoundActive() ? {
        finalTurnsRemaining: this.finalTurnsRemaining,
        ...(this.pendingFinalRound ? { pendingFinalRound: true } : {})
      } : {}),
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
    const needsInitialRackRepair = () => (
      !this.gameOver &&
      this.turnIndex === 0 &&
      this.tilesDrawn === 0 &&
      this.history.length === 0 &&
      this.players.length > 0 &&
      this.players.every((player) => (player.rack || []).length === 0) &&
      !Array.isArray(source.boardTiles) &&
      !Array.isArray(source.activePlacements) &&
      !Array.isArray(source.discardedTiles) &&
      !Array.isArray(source.marketplaceTiles)
    );
    const repairInitialEmptyRacks = () => {
      const loadedPlayerIndex = this.currentPlayerIndex;

      this.players.forEach((_, index) => {
        this.currentPlayerIndex = index;
        this.drawSevenTiles({ ensureRainbow: true });
      });
      this.currentPlayerIndex = loadedPlayerIndex;
    };

    this.id = String(source.id || "").toUpperCase();
    this.startDate = String(source.startDate || "");
    this.lastPlayDate = String(source.lastPlayDate || this.startDate);
    this.tilesDrawn = Number.isInteger(Number(source.tilesDrawn))
      ? Math.max(0, Number(source.tilesDrawn))
      : Math.max(0, this.totalTilePool - this.tilesRemaining);
    this.reconcileStartingPoolForLoadedState();
    this.finalTurnsRemaining = Number.isInteger(Number(source.finalTurnsRemaining))
      ? Math.max(0, Number(source.finalTurnsRemaining))
      : null;
    this.pendingFinalRound = Boolean(source.pendingFinalRound) && this.isFinalRoundActive();
    this.marketplaceClosed = Boolean(source.marketplaceClosed);
    this.gameOver = Boolean(source.gameOver);
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

    if (needsInitialRackRepair()) {
      repairInitialEmptyRacks();
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

    if (!Array.isArray(source.marketplaceTiles) && !this.marketplaceClosed) {
      this.drawMarketplaceTiles();
    } else if (!this.marketplaceClosed) {
      this.reconcileMarketplaceDuplicateLetters();
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

function normalizePlayerName(name) {
  return String(name || "").trim();
}

function normalizeNameKey(name) {
  return normalizePlayerName(name).toLowerCase();
}

export { WordWefterGameState, normalizePlayerName, normalizeNameKey };
