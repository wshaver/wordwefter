import { dictionaryWordSet } from "./dictionary.js";
import { letter_freq, letter_points, letters_available } from "./letter-setup.js";

class WordWefterGameState {
  constructor(setup = {}) {
    const playerNames = setup.playerNames || [setup.playerName || "Player 1"];

    this.id = setup.id || WordWefterGameState.createGameId();
    this.startDate = setup.startDate || new Date().toISOString();
    this.letterFrequencies = { ...letter_freq, ...setup.letterFrequencies };
    this.letterPoints = { ...letter_points, ...setup.letterPoints };
    this.startingLettersAvailable = { ...letters_available, ...setup.lettersAvailable };
    this.lettersAvailable = { ...this.startingLettersAvailable };
    this.dictionary = setup.dictionary || dictionaryWordSet;
    this.players = this.normalizePlayers(playerNames);
    this.currentPlayerIndex = 0;
    this.turnIndex = Number.isInteger(Number(setup.turnIndex)) ? Number(setup.turnIndex) : 0;
    this.discardedTiles = [];
    this.boardTiles = new Map();
    this.activePlacements = new Map();
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
    return Object.values(this.lettersAvailable).reduce((total, count) => total + count, 0);
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

  advanceTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

    if (this.currentRack.length === 0) {
      this.drawSevenTiles();
    }
  }

  advanceTurnIndex() {
    this.turnIndex += 1;
  }

  drawTiles(tileCount = 7) {
    if (!Number.isInteger(tileCount) || tileCount < 0) {
      throw new Error("tileCount must be a non-negative integer.");
    }

    const drawnTiles = [];

    while (drawnTiles.length < tileCount && this.tilesRemaining > 0) {
      const tile = this.drawTile();

      if (tile) {
        drawnTiles.push(tile);
      }
    }

    this.currentRack.push(...drawnTiles);
    return drawnTiles;
  }

  drawSevenTiles() {
    return this.drawTiles(7);
  }

  drawTile() {
    const weightedLetters = Object.entries(this.lettersAvailable)
      .filter(([, count]) => count > 0);
    const totalWeight = weightedLetters.reduce((total, [, count]) => total + count, 0);

    if (totalWeight === 0) {
      return null;
    }

    let drawIndex = Math.floor(Math.random() * totalWeight);

    for (const [letter, count] of weightedLetters) {
      if (drawIndex < count) {
        this.lettersAvailable[letter] -= 1;

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
      rack: []
    }));
    this.currentPlayerIndex = 0;
    this.turnIndex = 0;
    this.discardedTiles = [];
    this.boardTiles = new Map();
    this.activePlacements = new Map();
    this.nextTileId = 1;
    this.flashActivePlacements = false;
  }

  mapToTileArray(tileMap) {
    return Array.from(tileMap.values()).map((tile) => ({ ...tile }));
  }

  serializeTile(tile) {
    return {
      letter: tile.letter,
      ...(Number.isInteger(tile.row) ? { row: tile.row } : {}),
      ...(Number.isInteger(tile.column) ? { column: tile.column } : {})
    };
  }

  toJSON() {
    return {
      version: 1,
      id: this.id,
      startDate: this.startDate,
      turnIndex: this.turnIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      players: this.players.map((player) => ({
        name: player.name,
        score: player.score,
        rack: player.rack.map((tile) => this.serializeTile(tile))
      })),
      lettersAvailable: { ...this.lettersAvailable },
      ...(this.flashActivePlacements ? { flashActivePlacements: true } : {}),
      ...(this.discardedTiles.length > 0 ? {
        discardedTiles: this.discardedTiles.map((tile) => this.serializeTile(tile))
      } : {}),
      ...(this.boardTiles.size > 0 ? {
        boardTiles: this.mapToTileArray(this.boardTiles).map((tile) => this.serializeTile(tile))
      } : {}),
      ...(this.activePlacements.size > 0 ? {
        activePlacements: this.mapToTileArray(this.activePlacements).map((tile) => this.serializeTile(tile))
      } : {})
    };
  }

  loadFromJSON(gameStateJSON) {
    const source = typeof gameStateJSON === "string"
      ? JSON.parse(gameStateJSON)
      : gameStateJSON;

    if (!source || typeof source !== "object") {
      throw new Error("Game state must be a JSON object.");
    }

    if (source.version !== 1) {
      throw new Error("Game state version must be 1.");
    }

    this.letterFrequencies = { ...letter_freq };
    this.letterPoints = { ...letter_points };
    this.startingLettersAvailable = { ...letters_available };
    this.lettersAvailable = { ...this.startingLettersAvailable, ...source.lettersAvailable };
    this.nextTileId = 1;

    const hydrateTile = (tile) => {
      const letter = String(tile.letter || "").toUpperCase();

      if (!letter) {
        throw new Error("Tiles must include a letter.");
      }

      return {
        id: `tile-${this.nextTileId++}`,
        letter,
        points: this.letterPoints[letter],
        frequency: this.letterFrequencies[letter],
        ...(Number.isInteger(Number(tile.row)) ? { row: Number(tile.row) } : {}),
        ...(Number.isInteger(Number(tile.column)) ? { column: Number(tile.column) } : {})
      };
    };
    const hydrateTileMap = (tiles, active) => {
      const tileMap = new Map();

      (tiles || []).forEach((tile) => {
        const hydratedTile = {
          ...hydrateTile(tile),
          active
        };

        if (!Number.isInteger(hydratedTile.row) || !Number.isInteger(hydratedTile.column)) {
          throw new Error("Board tiles must include integer row and column values.");
        }

        tileMap.set(this.getCellKey(hydratedTile.row, hydratedTile.column), hydratedTile);
      });

      return tileMap;
    };

    this.id = String(source.id || "").toUpperCase();
    this.startDate = String(source.startDate || "");
    this.turnIndex = Number.isInteger(Number(source.turnIndex)) ? Math.max(0, Number(source.turnIndex)) : 0;
    this.players = (source.players || []).map((player) => ({
      name: String(player.name || "Player"),
      score: Number(player.score || 0),
      rack: (player.rack || []).map(hydrateTile)
    }));

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

  getCellKey(row, column) {
    return `${row},${column}`;
  }

  getTileAt(row, column) {
    const cellKey = this.getCellKey(row, column);

    return this.activePlacements.get(cellKey) || this.boardTiles.get(cellKey) || null;
  }

  hasActivePlacements() {
    return this.activePlacements.size > 0;
  }

  isCellOccupied(row, column) {
    return Boolean(this.getTileAt(row, column));
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

    if (
      !Number.isInteger(normalizedRow) ||
      !Number.isInteger(normalizedColumn) ||
      normalizedRow < 0 ||
      normalizedRow >= boardSize ||
      normalizedColumn < 0 ||
      normalizedColumn >= boardSize ||
      this.isCellOccupiedForMove(normalizedRow, normalizedColumn, tileId)
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

  isCellOccupiedForMove(row, column, movingTileId) {
    const cellKey = this.getCellKey(row, column);
    const activeTile = this.activePlacements.get(cellKey);

    if (activeTile && activeTile.id === movingTileId) {
      return false;
    }

    return Boolean(activeTile || this.boardTiles.get(cellKey));
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

    this.activePlacements.delete(existingKey);
    this.activePlacements.set(this.getCellKey(normalizedRow, normalizedColumn), {
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
    this.currentRack.splice(normalizedTargetIndex, 0, {
      id: tile.id,
      letter: tile.letter,
      points: tile.points,
      frequency: tile.frequency
    });
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

  resetActivePlacements() {
    this.currentRack.push(...Array.from(this.activePlacements.values()).map((tile) => ({
      id: tile.id,
      letter: tile.letter,
      points: tile.points,
      frequency: tile.frequency
    })));
    this.activePlacements.clear();
  }

  getBoardWords() {
    const words = [];
    const collectWord = (tiles) => {
      if (tiles.length > 1) {
        words.push(tiles.map((tile) => tile.letter).join(""));
      }
    };

    for (let row = 0; row < boardSize; row += 1) {
      let currentWordTiles = [];

      for (let column = 0; column < boardSize; column += 1) {
        const tile = this.getTileAt(row, column);

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
        const tile = this.getTileAt(row, column);

        if (tile) {
          currentWordTiles.push(tile);
        } else {
          collectWord(currentWordTiles);
          currentWordTiles = [];
        }
      }

      collectWord(currentWordTiles);
    }

    return words;
  }

  getWordAt(row, column, direction) {
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
      score: tiles.reduce((total, tile) => total + tile.points, 0),
      word: tiles.map((tile) => tile.letter).join("")
    };
  }

  getChangedWords() {
    const changedWords = new Map();

    this.activePlacements.forEach((tile) => {
      ["row", "column"].forEach((direction) => {
        const word = this.getWordAt(tile.row, tile.column, direction);

        if (word.word.length > 1) {
          changedWords.set(word.key, word);
        }
      });
    });

    return Array.from(changedWords.values());
  }

  getCurrentTurnScore() {
    return this.getChangedWords().reduce((total, word) => total + word.score, 0);
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

  validateActivePlacementLine() {
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

    const validation = this.validateBoardWords();

    if (!validation.isValid) {
      this.flashActivePlacements = true;
      return validation;
    }

    const turnWords = this.getChangedWords();
    const turnScore = this.getCurrentTurnScore();

    this.activePlacements.forEach((tile, cellKey) => {
      this.boardTiles.set(cellKey, {
        ...tile,
        active: false
      });
    });
    this.activePlacements.clear();
    this.flashActivePlacements = false;
    this.currentScore += turnScore;
    this.drawTiles(Math.max(0, 7 - this.currentRack.length));

    return {
      ...validation,
      turnScore,
      turnWords
    };
  }
}

const gameState = new WordWefterGameState();
const boardSize = 12;
const serverURL = "./server.php";
const playerNameCookie = "wordwefterPlayerName";
const turnPollMilliseconds = 3000;
let rackSortable = null;
let boardSortables = [];
let pendingIdentityAction = null;
let turnPollTimer = null;
let remotePlayedCellKeys = new Set();
let remotePlayedClearTimer = null;
let loadingGameFromURL = false;

window.WordWefterGameState = WordWefterGameState;
window.wordWefterGame = gameState;
window.isWordWefterWord = (word) => gameState.isRealWord(word);

function createTileElement(tile, options = {}) {
  const tileElement = document.createElement("div");
  const letterElement = document.createElement("span");
  const pointsElement = document.createElement("span");

  tileElement.className = "tile";
  tileElement.dataset.tileId = tile.id;
  tileElement.dataset.tileSource = options.source || "rack";
  letterElement.textContent = tile.letter;
  pointsElement.className = "tile-points";
  pointsElement.textContent = tile.points;

  if (options.movable) {
    tileElement.classList.add("tile-movable");
  }

  if (options.source === "board" && options.active) {
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

    const tile = gameState.getTileAt(Number(cell.dataset.row), Number(cell.dataset.column));

    if (tile) {
      const cellKey = gameState.getCellKey(Number(cell.dataset.row), Number(cell.dataset.column));

      cell.append(createTileElement(tile, {
        active: tile.active,
        flash: tile.active && gameState.flashActivePlacements,
        movable: tile.active && isMyTurn(),
        remotePlayed: remotePlayedCellKeys.has(cellKey),
        source: "board"
      }));
    }

    board.append(cell);
  }
}

function renderRack() {
  const rack = document.querySelector("#rack");

  if (!rack) {
    return;
  }

  rack.replaceChildren();

  gameState.currentRack.forEach((tile) => {
    rack.append(createTileElement(tile, { movable: isMyTurn(), source: "rack" }));
  });
}

function updatePlacementControls() {
  const canPlay = isMyTurn();
  const hasActivePlacements = gameState.hasActivePlacements();

  document.body.classList.toggle("has-active-placement", canPlay && hasActivePlacements);
  document.body.classList.toggle("is-my-turn", canPlay);
  document.querySelectorAll("#draw-tile-button, #finish-placement-button, #reset-placement-button")
    .forEach((button) => {
      button.disabled = !canPlay;
    });
}

function renderScore() {
  const currentScoreElement = document.querySelector("#current-score");
  const currentTurnScoreElement = document.querySelector("#current-turn-score");
  const currentPlayerNameElement = document.querySelector("#current-player-name");
  const currentGameIdElement = document.querySelector("#current-game-id");
  const currentTurnIndexElement = document.querySelector("#current-turn-index");
  const playerScoreListElement = document.querySelector("#player-score-list");
  const tilesRemainingElement = document.querySelector("#tiles-remaining");

  if (currentScoreElement) {
    currentScoreElement.textContent = gameState.currentScore;
  }

  if (currentTurnScoreElement) {
    currentTurnScoreElement.textContent = gameState.getCurrentTurnScore();
  }

  if (currentPlayerNameElement) {
    currentPlayerNameElement.textContent = isMyTurn()
      ? `${gameState.currentPlayerName} (you)`
      : gameState.currentPlayerName;
  }

  if (currentGameIdElement) {
    currentGameIdElement.textContent = gameState.id;
  }

  if (currentTurnIndexElement) {
    currentTurnIndexElement.textContent = gameState.turnIndex;
  }

  if (tilesRemainingElement) {
    tilesRemainingElement.textContent = gameState.tilesRemaining;
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
        badge.textContent = isMyTurn() ? "Your turn" : "Turn";
        nameElement.append(badge);
      }

      scoreElement.textContent = player.score;
      row.append(nameElement, scoreElement);
      playerScoreListElement.append(row);
    });
  }
}

function renderGameStateJSON() {
  const gameStateElement = document.querySelector("#game-state-json");

  renderPlayerNameInputs(gameState.players.map((player) => player.name));

  if (!gameStateElement || document.activeElement === gameStateElement) {
    return;
  }

  gameStateElement.value = JSON.stringify(gameState.toJSON(), null, 2);
}

function renderGame() {
  destroySortables();
  renderBoard();
  renderRack();
  updatePlacementControls();
  renderScore();
  renderGameStateJSON();
  initializeSortables();
  updateTurnPolling();
}

function setGameMessage(message) {
  const messageElement = document.querySelector("#game-message");

  if (messageElement) {
    messageElement.textContent = message;
  }
}

function getGameIdFromURLHash() {
  const hash = window.location.hash.replace(/^#/, "").trim().toUpperCase();

  return /^[A-Z0-9]{5}$/.test(hash) ? hash : "";
}

function isGameListURLHash() {
  return window.location.hash.replace(/^#/, "").trim().toLowerCase() === "gamelist";
}

function setGameURLGameId(gameId) {
  const normalizedGameId = String(gameId || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{5}$/.test(normalizedGameId)) {
    return;
  }

  if (window.location.hash !== `#${normalizedGameId}`) {
    window.history.replaceState(null, "", `#${normalizedGameId}`);
  }
}

function setGameListURLHash() {
  if (window.location.hash !== "#gamelist") {
    window.history.replaceState(null, "", "#gamelist");
  }
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

  row.className = "player-name-row";
  label.className = "sr-only";
  label.htmlFor = inputId;
  label.textContent = `Player ${playerNumber} name`;
  input.className = "player-name-input";
  input.id = inputId;
  input.type = "text";
  input.value = name;
  input.placeholder = `Player ${playerNumber}`;
  input.setAttribute("aria-label", `Player ${playerNumber} name`);
  input.readOnly = Boolean(options.locked);
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

  row.append(label, input, removeButton);
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

  document.body.classList.remove("screen-welcome", "screen-setup", "screen-list", "screen-play");
  document.body.classList.add(`screen-${screenName}`);

  if (screenName !== "play" && shouldClearGameURL) {
    clearGameURLGameId();
  }

  closeIdentityMenu();
  updateTurnPolling();
}

function showNewGameSetup() {
  requirePlayerName(() => {
    const otherPlayerNames = gameState.players.slice(1).map((player) => player.name);

    renderPlayerNameInputs([
      getStoredPlayerName(),
      ...(otherPlayerNames.length > 0 ? otherPlayerNames : ["Player 2"])
    ]);
    setGameMessage("");
    setScreen("setup");
  });
}

async function showGameList(options = {}) {
  requirePlayerName(async () => {
    setGameMessage("");
    setScreen("list", { clearGameURL: false });

    if (options.updateURL !== false) {
      setGameListURLHash();
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

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Server request failed.");
  }

  return payload;
}

async function saveGameState() {
  const payload = await fetchJSON(`${serverURL}?action=save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(gameState.toJSON())
  });

  if (payload.stale) {
    throw new Error(payload.error || "Save ignored because a newer turn is already stored.");
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

    remotePlayedCellKeys = new Set(changedCellKeys);
    gameState.loadFromJSON(payload.gameState);
    renderGame();

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
  const shouldPoll = document.body.classList.contains("screen-play") && !isMyTurn();

  if (!shouldPoll) {
    window.clearInterval(turnPollTimer);
    turnPollTimer = null;
    return;
  }

  if (!turnPollTimer) {
    turnPollTimer = window.setInterval(pollActiveGameState, turnPollMilliseconds);
  }
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
    const matchingGames = (payload.games || []).filter((game) => (
      (game.playerNames || []).some((name) => normalizeNameKey(name) === storedPlayerKey)
    ));

    activeGamesList.replaceChildren();

    if (matchingGames.length === 0) {
      const emptyElement = document.createElement("div");
      emptyElement.className = "active-game-row";
      emptyElement.textContent = `No saved games for ${storedPlayerName}`;
      activeGamesList.append(emptyElement);
      return;
    }

    matchingGames.forEach((game) => {
      const row = document.createElement("div");
      const idElement = document.createElement("span");
      const detailsElement = document.createElement("div");
      const playersElement = document.createElement("span");
      const turnElement = document.createElement("span");
      const resumeButton = document.createElement("button");

      row.className = "active-game-row";
      row.dataset.gameId = game.id;
      idElement.className = "active-game-id";
      detailsElement.className = "active-game-players";
      turnElement.className = "active-game-turn";
      resumeButton.className = "game-button secondary";
      resumeButton.type = "button";
      idElement.textContent = game.id;
      playersElement.textContent = (game.playerNames || []).join(", ");
      turnElement.textContent = `Turn ${Number(game.turnIndex || 0)}: ${game.currentPlayerName || "Player"}`;
      resumeButton.textContent = "Resume";
      resumeButton.addEventListener("click", () => resumeGame(game.id));

      detailsElement.append(playersElement, turnElement);
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
  setScreen("play");
  setGameURLGameId(gameState.id);
  setGameMessage("");
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
  gameState.reset();
  gameState.players.forEach((_, index) => {
    gameState.currentPlayerIndex = index;
    gameState.drawSevenTiles();
  });
  gameState.currentPlayerIndex = 0;
  setScreen("play");
  setGameURLGameId(gameState.id);
  setGameMessage("");
  renderGame();

  try {
    await saveGameState();
    await loadActiveGames();
  } catch (error) {
    setGameMessage(`Game started, but could not save: ${error.message}`);
  }
}

async function drawTileToRack() {
  if (!document.body.classList.contains("screen-play")) {
    showNewGameSetup();
    return;
  }

  if (!isMyTurn()) {
    return;
  }

  gameState.drawTiles(1);
  renderGame();
}

async function finishPlacement() {
  if (!isMyTurn()) {
    return;
  }

  const result = gameState.finishActivePlacements();

  if (result && !result.isValid) {
    setGameMessage(result.placementError || `Not in dictionary: ${result.invalidWords.join(", ")}`);
  } else if (result && result.isValid) {
    gameState.advanceTurn();
    gameState.advanceTurnIndex();
    setGameMessage("");
  }

  renderGame();

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
  if (!isMyTurn()) {
    return;
  }

  gameState.resetActivePlacements();
  gameState.flashActivePlacements = false;
  setGameMessage("");
  renderGame();
}

function toggleDebugPanel() {
  const isOpen = !document.body.classList.contains("debug-open");
  const debugToggleButton = document.querySelector("#debug-toggle-button");

  document.body.classList.toggle("debug-open", isOpen);

  if (debugToggleButton) {
    debugToggleButton.setAttribute("aria-expanded", String(isOpen));
    debugToggleButton.textContent = isOpen ? "Hide Debug" : "Debug";
  }
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

function installGameStateFromInput() {
  const gameStateElement = document.querySelector("#game-state-json");

  if (!gameStateElement) {
    return;
  }

  try {
    gameState.loadFromJSON(gameStateElement.value);
    setScreen("play");
    setGameMessage("");
    gameStateElement.blur();
    renderGame();
  } catch (error) {
    setGameMessage(`Could not install game state: ${error.message}`);
  }
}

function destroySortables() {
  if (rackSortable) {
    rackSortable.destroy();
    rackSortable = null;
  }

  boardSortables.forEach((sortable) => sortable.destroy());
  boardSortables = [];
}

function getSortableSource(event) {
  return event.from && event.from.id === "rack" ? "rack" : "board";
}

function initializeRackSortable() {
  const rack = document.querySelector("#rack");

  if (!rack || !window.Sortable || !isMyTurn()) {
    return;
  }

  rackSortable = Sortable.create(rack, {
    animation: 120,
    draggable: ".tile-movable",
    group: {
      name: "wordwefter-tiles",
      pull: true,
      put: true
    },
    onAdd(event) {
      if (getSortableSource(event) !== "board") {
        renderGame();
        return;
      }

      if (gameState.moveActiveTileToRack(event.item.dataset.tileId, event.newIndex)) {
        setGameMessage("");
      }

      renderGame();
    },
    onUpdate(event) {
      gameState.moveRackTile(event.item.dataset.tileId, event.newIndex);
      renderGame();
    }
  });
}

function initializeBoardSortables() {
  if (!window.Sortable || !isMyTurn()) {
    return;
  }

  document.querySelectorAll(".board-cell").forEach((cell) => {
    const sortable = Sortable.create(cell, {
      animation: 120,
      draggable: ".tile-movable",
      group: {
        name: "wordwefter-tiles",
        pull: true,
        put(to, from, dragElement) {
          const tileSource = from.el.id === "rack" ? "rack" : "board";

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
  initializeBoardSortables();
}

function bindGameControls() {
  const saveIdentityButton = document.querySelector("#save-identity-button");
  const identityNameInput = document.querySelector("#identity-name-input");
  const identityMenuButton = document.querySelector("#identity-menu-button");
  const logoutButton = document.querySelector("#logout-button");
  const showNewGameButton = document.querySelector("#show-new-game-button");
  const showGameListButton = document.querySelector("#show-game-list-button");
  const createGameButton = document.querySelector("#create-game-button");
  const addPlayerButton = document.querySelector("#add-player-button");
  const drawTileButton = document.querySelector("#draw-tile-button");
  const finishPlacementButton = document.querySelector("#finish-placement-button");
  const resetPlacementButton = document.querySelector("#reset-placement-button");
  const installGameStateButton = document.querySelector("#install-game-state-button");
  const debugToggleButton = document.querySelector("#debug-toggle-button");

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

  if (createGameButton) {
    createGameButton.addEventListener("click", startNewGame);
  }

  if (addPlayerButton) {
    addPlayerButton.addEventListener("click", () => {
      const input = addPlayerNameInput(`Player ${getPlayerNameInputs().length + 1}`);

      input?.focus();
    });
  }

  if (drawTileButton) {
    drawTileButton.addEventListener("click", drawTileToRack);
  }

  if (finishPlacementButton) {
    finishPlacementButton.addEventListener("click", finishPlacement);
  }

  if (resetPlacementButton) {
    resetPlacementButton.addEventListener("click", resetPlacement);
  }

  if (debugToggleButton) {
    debugToggleButton.addEventListener("click", toggleDebugPanel);
  }

  if (installGameStateButton) {
    installGameStateButton.addEventListener("click", installGameStateFromInput);
  }
}

async function initializeApp() {
  updateIdentityUI();
  renderPlayerNameInputs(parsePlayerNames());
  bindGameControls();
  updatePlayerRemoveButtons();
  const loadedHashGame = await loadGameFromURLHash();

  if (!loadedHashGame) {
    loadActiveGames();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

window.addEventListener("hashchange", async () => {
  if (!window.location.hash) {
    return;
  }

  await loadGameFromURLHash();
});

window.startWordWefterGame = startNewGame;
window.drawWordWefterTile = drawTileToRack;
window.finishWordWefterPlacement = finishPlacement;
window.resetWordWefterPlacement = resetPlacement;
window.installWordWefterGameState = installGameStateFromInput;

export { WordWefterGameState, gameState };
