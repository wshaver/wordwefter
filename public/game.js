import { letter_freq, letter_points, letters_available } from "./letter-setup.js";

class WordWefterGameState {
  constructor(setup = {}) {
    this.letterFrequencies = { ...letter_freq, ...setup.letterFrequencies };
    this.letterPoints = { ...letter_points, ...setup.letterPoints };
    this.startingLettersAvailable = { ...letters_available, ...setup.lettersAvailable };
    this.lettersAvailable = { ...this.startingLettersAvailable };
    this.currentRack = [];
    this.discardedTiles = [];
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
  }
}

const gameState = new WordWefterGameState();
const boardSize = 12;

window.WordWefterGameState = WordWefterGameState;
window.wordWefterGame = gameState;

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
    const tileElement = document.createElement("div");
    const letterElement = document.createElement("span");
    const pointsElement = document.createElement("span");

    tileElement.className = "tile";
    letterElement.textContent = tile.letter;
    pointsElement.className = "tile-points";
    pointsElement.textContent = tile.points;

    tileElement.append(letterElement, pointsElement);
    rack.append(tileElement);
  });
}

function startNewGame() {
  document.body.classList.add("game-started");
  gameState.reset();
  gameState.drawSevenTiles();
  renderBoard();
  renderRack();
}

function bindGameControls() {
  const newGameButton = document.querySelector("#new-game-button");

  if (newGameButton) {
    newGameButton.addEventListener("click", startNewGame);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindGameControls);
} else {
  bindGameControls();
}

window.startWordWefterGame = startNewGame;

export { WordWefterGameState, gameState };
