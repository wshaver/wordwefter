import { dictionaryWordSet } from "./dictionary.js";
import { letter_freq, letter_points, letters_available } from "./letter-setup.js";

class WordWefterGameState {
  constructor(setup = {}) {
    this.letterFrequencies = { ...letter_freq, ...setup.letterFrequencies };
    this.letterPoints = { ...letter_points, ...setup.letterPoints };
    this.startingLettersAvailable = { ...letters_available, ...setup.lettersAvailable };
    this.lettersAvailable = { ...this.startingLettersAvailable };
    this.dictionary = setup.dictionary || dictionaryWordSet;
    this.currentRack = [];
    this.discardedTiles = [];
    this.boardTiles = new Map();
    this.activePlacements = new Map();
    this.nextTileId = 1;
    this.flashActivePlacements = false;
  }

  get tilesRemaining() {
    return Object.values(this.lettersAvailable).reduce((total, count) => total + count, 0);
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
    this.currentRack = [];
    this.discardedTiles = [];
    this.boardTiles = new Map();
    this.activePlacements = new Map();
    this.nextTileId = 1;
    this.flashActivePlacements = false;
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

    this.activePlacements.forEach((tile, cellKey) => {
      this.boardTiles.set(cellKey, {
        ...tile,
        active: false
      });
    });
    this.activePlacements.clear();
    this.flashActivePlacements = false;
    this.drawTiles(Math.max(0, 7 - this.currentRack.length));

    return validation;
  }
}

const gameState = new WordWefterGameState();
const boardSize = 12;
let rackSortable = null;
let boardSortables = [];

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
      cell.append(createTileElement(tile, {
        active: tile.active,
        flash: tile.active && gameState.flashActivePlacements,
        movable: tile.active,
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
    rack.append(createTileElement(tile, { movable: true, source: "rack" }));
  });
}

function updatePlacementControls() {
  document.body.classList.toggle("has-active-placement", gameState.hasActivePlacements());
}

function renderGame() {
  destroySortables();
  renderBoard();
  renderRack();
  updatePlacementControls();
  initializeSortables();
}

function setGameMessage(message) {
  const messageElement = document.querySelector("#game-message");

  if (messageElement) {
    messageElement.textContent = message;
  }
}

function startNewGame() {
  document.body.classList.add("game-started");
  gameState.reset();
  gameState.drawSevenTiles();
  setGameMessage("");
  renderGame();
}

function drawTileToRack() {
  if (!document.body.classList.contains("game-started")) {
    startNewGame();
    return;
  }

  gameState.drawTiles(1);
  renderGame();
}

function finishPlacement() {
  const result = gameState.finishActivePlacements();

  if (result && !result.isValid) {
    setGameMessage(result.placementError || `Not in dictionary: ${result.invalidWords.join(", ")}`);
  } else {
    setGameMessage("");
  }

  renderGame();
}

function resetPlacement() {
  gameState.resetActivePlacements();
  gameState.flashActivePlacements = false;
  setGameMessage("");
  renderGame();
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

  if (!rack || !window.Sortable) {
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
  if (!window.Sortable) {
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
  const newGameButton = document.querySelector("#new-game-button");
  const drawTileButton = document.querySelector("#draw-tile-button");
  const finishPlacementButton = document.querySelector("#finish-placement-button");
  const resetPlacementButton = document.querySelector("#reset-placement-button");

  if (newGameButton) {
    newGameButton.addEventListener("click", startNewGame);
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindGameControls);
} else {
  bindGameControls();
}

window.startWordWefterGame = startNewGame;
window.drawWordWefterTile = drawTileToRack;
window.finishWordWefterPlacement = finishPlacement;
window.resetWordWefterPlacement = resetPlacement;

export { WordWefterGameState, gameState };
