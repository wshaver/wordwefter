import {
  bonusTypes,
  gameLengthSettings,
  wildcardLetter,
  playableLetters,
  letter_points,
  boardSize,
  startCell
} from "./game-config.js";
import { WordWefterGameState, normalizeNameKey, normalizePlayerName } from "./game-state.js";

const gameState = new WordWefterGameState();
const welcomeDemoGameState = {
  version: 1,
  id: "DEMO1",
  startDate: "2026-06-19T00:00:00.000Z",
  lastPlayDate: "2026-06-19T00:00:00.000Z",
  gameLength: "normal",
  tilesDrawn: 26,
  turnIndex: 5,
  currentPlayerIndex: 0,
  players: [
    {
      name: "You",
      score: 1000,
      rack: [
        { letter: "P" },
        { letter: "L" },
        { letter: "F" },
        { letter: "U" },
        { letter: "A" },
        { letter: "L" },
        { letter: "Y" }
      ]
    },
    {
      name: "Mina",
      score: 35,
      rack: [
        { letter: "N" },
        { letter: "O" },
        { letter: "L" },
        { letter: "S" },
        { letter: "T" },
        { letter: "A" },
        { letter: "E" }
      ]
    }
  ],
  boardTiles: [
    { row: 0, column: 5, letter: "L" },
    { row: 1, column: 0, letter: "S" },
    { row: 1, column: 1, letter: "T" },
    { row: 1, column: 2, letter: "A" },
    { row: 1, column: 3, letter: "C" },
    {
      row: 1,
      column: 4,
      letter: "K",
      stack: [
        { letter: "C" },
        { letter: "K" }
      ]
    },
    { row: 1, column: 5, letter: "A" },
    {
      row: 1,
      column: 6,
      letter: "B",
      stack: [
        { letter: "I" },
        { letter: "B", rainbow: true }
      ]
    },
    {
      row: 1,
      column: 7,
      letter: "L",
      stack: [
        { letter: "L" },
        { letter: "L" }
      ]
    },
    {
      row: 1,
      column: 8,
      letter: "E",
      stack: [
        { letter: "E" },
        { letter: "E" }
      ]
    },
    { row: 2, column: 0, letter: "C" },
    { row: 2, column: 5, letter: "Y" },
    { row: 3, column: 0, letter: "O" },
    { row: 3, column: 3, letter: "S" },
    { row: 3, column: 5, letter: "E" },
    { row: 3, column: 8, letter: "W", rainbow: true },
    { row: 4, column: 0, letter: "R" },
    { row: 4, column: 2, letter: "R" },
    { row: 4, column: 3, letter: "O" },
    { row: 4, column: 4, letter: "A" },
    { row: 4, column: 5, letter: "R" },
    { row: 4, column: 8, letter: "O" },
    { row: 5, column: 0, letter: "I" },
    {
      row: 5,
      column: 3,
      letter: "C",
      stack: [
        { letter: "R" },
        { letter: "C" }
      ]
    },
    {
      row: 5,
      column: 4,
      letter: "L",
      stack: [
        { letter: "O" },
        { letter: "L" }
      ]
    },
    { row: 5, column: 5, letter: "E" },
    {
      row: 5,
      column: 6,
      letter: "V",
      stack: [
        { letter: "R" },
        { letter: "V" }
      ]
    },
    { row: 5, column: 7, letter: "E" },
    { row: 5, column: 8, letter: "R" },
    { row: 6, column: 0, letter: "N" },
    { row: 6, column: 3, letter: "I" },
    { row: 6, column: 5, letter: "D" },
    { row: 6, column: 8, letter: "D" },
    { row: 7, column: 0, letter: "G" },
    { row: 7, column: 3, letter: "A" },
    { row: 7, column: 8, letter: "S" },
    { row: 8, column: 1, letter: "T" },
    { row: 8, column: 2, letter: "I" },
    { row: 8, column: 3, letter: "L", rainbow: true },
    { row: 8, column: 4, letter: "E" },
    { row: 8, column: 5, letter: "S" }
  ],
  marketplaceTiles: [
    { letter: "E" },
    { letter: "X" },
    { letter: "A" },
    { letter: "M" },
    { letter: "P" },
    { letter: "L" },
    { letter: "E" }
  ]
};
const serverURL = "./server.php";
const playerNameCookie = "wordwefterPlayerName";
const playerAuthCookie = "wordwefterPlayerAuth";
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
const defaultGameMessageClearMilliseconds = 5000;
const storedAuthMaxAgeSeconds = 60 * 60 * 24 * 400;
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
let gameMessageToken = 0;
let lastTurnNotificationKey = "";
let remotePlayedCellKeys = new Set();
let remotePlayedClearTimer = null;
let loadingGameFromURL = false;
let spectatorMode = false;
let marketplaceRenderTimer = null;
let renderedRackTileKeys = [];
let renderedMarketplaceTileKeys = [];
let renderedGameId = "";
let turnStartGameStateJSON = "";
let showingPoolView = false;
let waitingGamesForMenu = [];
let serverOAuthConfig = null;
let serverDeploymentConfig = null;
const tileEnterDurations = [520, 560, 540, 500];
const tileEnterYOffsets = ["0.45rem", "-0.4rem", "-0.55rem", "0.16rem"];
const tileEnterRotations = ["-10deg", "11deg", "-6deg", "5deg"];
const rainbowTileAnimationMilliseconds = 7200;
const rainbowTileAnimationStartedAt = Date.now();
const gameMessageAnimationMilliseconds = 180;
let tileEnterQueueAvailableAt = 0;
let brandEfterAnimated = false;

function isLegacyNameLoginAllowed() {
  return Boolean(serverDeploymentConfig?.allowLegacyNameLogin) ||
    isLocalWordwefterHttpHost();
}

function isNewGameCreationDisabled() {
  return Boolean(serverDeploymentConfig?.disableNewGames);
}

function isLocalWordwefterHttpHost() {
  return window.location.protocol === "http:" &&
    /^wordwefter$/i.test(window.location.hostname);
}

function isLoopbackHttpHost() {
  return window.location.protocol === "http:" &&
    /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1)$/i.test(window.location.hostname);
}

function isLocalOAuthFallbackAllowed() {
  return isLoopbackHttpHost();
}

let updateWordWefterTestingDataset = () => {};

async function loadWordWefterTestHooks() {
  if (/(^|\.)wordwefter\.com$/i.test(window.location.hostname)) {
    return;
  }

  try {
    const testHooks = await import("../public/test-hooks.js");
    const installedHooks = testHooks.installWordWefterTestHooks({
      WordWefterGameState,
      gameState,
      boardSize,
      startCell: { ...startCell },
      wildcardLetter,
      playableLetters: [...playableLetters],
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
    });

    if (typeof installedHooks?.updateWordWefterTestingDataset === "function") {
      updateWordWefterTestingDataset = installedHooks.updateWordWefterTestingDataset;
      updateWordWefterTestingDataset();
    }
  } catch {
    updateWordWefterTestingDataset = () => {};
  }
}

if (__WORDWEFTER_INCLUDE_TEST_HOOKS__) {
  loadWordWefterTestHooks();
}

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
        movable: tile.active && canInteractWithCurrentTurn(),
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

function animateSequentialTileEnter(tileElements, options = {}) {
  const now = Date.now();
  const useQueue = options.useQueue !== false;
  let nextDelay = useQueue ? Math.max(0, tileEnterQueueAvailableAt - now) : 0;
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

  if (useQueue) {
    tileEnterQueueAvailableAt = now + nextDelay;
  }
}

function animateBrandEfterTiles() {
  const efterTiles = Array.from(document.querySelectorAll(".brand-word-bottom .brand-tile"));

  if (
    brandEfterAnimated ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
    efterTiles.length === 0
  ) {
    return;
  }

  brandEfterAnimated = true;

  efterTiles.forEach((tileElement) => {
    tileElement.classList.remove("tile-enter-pending", "tile-enter-1", "tile-enter-2", "tile-enter-3", "tile-enter-4");
    tileElement.style.removeProperty("--shuffle-x");
    tileElement.style.removeProperty("--shuffle-y");
    tileElement.style.removeProperty("--shuffle-delay");
    tileElement.style.removeProperty("--tile-enter-rotation");
  });

  window.requestAnimationFrame(() => {
    animateSequentialTileEnter(efterTiles, { useQueue: false });
  });
}

function renderRack(options = {}) {
  const rack = document.querySelector("#rack");
  const visibleRack = getVisibleRack();
  const enteringTileKeyCounts = getNewTileAnimationKeyCounts(visibleRack, renderedRackTileKeys);

  if (!rack) {
    return;
  }

  rack.replaceChildren();

  if (isSpectatorMode()) {
    renderedRackTileKeys = [];
    return;
  }

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

function createMarketplaceCostRail() {
  const costRail = document.createElement("div");
  const slotCount = Math.max(7, gameState.marketplaceTiles.length);

  costRail.className = "marketplace-cost-rail";
  costRail.setAttribute("aria-label", "Marketplace tile costs");

  for (let index = 0; index < slotCount; index += 1) {
    const cost = index + 1;
    const costElement = document.createElement("span");

    costElement.className = "marketplace-tile-cost";
    costElement.textContent = `${cost}`;
    costElement.setAttribute("aria-label", `${cost} point${cost === 1 ? "" : "s"}`);
    costRail.append(costElement);
  }

  return costRail;
}

function createMarketplaceFrameSlots() {
  const slotCount = Math.max(7, gameState.marketplaceTiles.length);
  const slots = [];

  for (let index = 0; index < slotCount; index += 1) {
    const itemElement = document.createElement("div");
    const tilePlaceholder = document.createElement("div");

    itemElement.className = "marketplace-item marketplace-item-frame-placeholder";
    itemElement.setAttribute("aria-hidden", "true");
    tilePlaceholder.className = "tile marketplace-tile-placeholder";
    tilePlaceholder.textContent = " ";
    itemElement.append(tilePlaceholder);
    slots.push(itemElement);
  }

  return slots;
}

function renderMarketplace(options = {}) {
  const marketplace = document.querySelector("#marketplace");
  const enteringTileKeyCounts = options.enter
    ? getNewTileAnimationKeyCounts(gameState.marketplaceTiles, [])
    : getNewTileAnimationKeyCounts(gameState.marketplaceTiles, renderedMarketplaceTileKeys);

  if (!marketplace) {
    return;
  }

  window.clearTimeout(marketplaceRenderTimer);
  marketplaceRenderTimer = null;

  if (isSpectatorMode()) {
    marketplace.replaceChildren();
    renderedMarketplaceTileKeys = [];
    return;
  }

  if (Number.isFinite(options.delayMs) && options.delayMs > 0) {
    marketplace.replaceChildren(createMarketplaceCostRail(), ...createMarketplaceFrameSlots());
    marketplaceRenderTimer = window.setTimeout(() => {
      renderMarketplace({
        enter: options.enter
      });
    }, options.delayMs);
    return;
  }

  const openingSoon = gameState.shouldShowMarketplaceOpeningSoon();

  marketplace.replaceChildren();
  marketplace.append(createMarketplaceCostRail());

  if (openingSoon) {
    const openingSign = document.createElement("div");

    marketplace.append(...createMarketplaceFrameSlots());
    openingSign.className = "marketplace-opening-soon-sign";
    openingSign.setAttribute("aria-label", "Marketplace opening soon");
    openingSign.textContent = "OPENING SOON";
    marketplace.append(openingSign);
    renderedMarketplaceTileKeys = [];
    return;
  }

  if (gameState.marketplaceClosed) {
    const closedSign = document.createElement("div");

    marketplace.append(...createMarketplaceFrameSlots());
    closedSign.className = "marketplace-closed-sign";
    closedSign.setAttribute("aria-label", "Marketplace closed");
    closedSign.textContent = "CLOSED";
    marketplace.append(closedSign);
    renderedMarketplaceTileKeys = [];
    return;
  }

  gameState.marketplaceTiles.forEach((tile, index) => {
    const itemElement = document.createElement("div");
    const marketplaceCost = gameState.getMarketplaceTileCost(tile);

    itemElement.className = "marketplace-item";
    if (!tile) {
      itemElement.classList.add("marketplace-item-empty");
      marketplace.append(itemElement);
      return;
    }

    const canBuy = canInteractWithCurrentTurn() && !gameState.gameOver && gameState.canBuyTile(tile.id);

    itemElement.dataset.tileId = tile.id;
    itemElement.dataset.marketplaceCost = String(marketplaceCost);
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
  const canPlay = canInteractWithCurrentTurn() && !gameState.gameOver;
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
    shuffleRackButton.hidden = gameState.gameOver || isSpectatorMode();
    shuffleRackButton.disabled = gameState.gameOver || isSpectatorMode() || getVisibleRack().length < 2;
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
  document.body.classList.toggle("spectator-mode", isSpectatorMode());
  document.body.classList.toggle("game-over", gameState.gameOver);
  document.body.classList.toggle("marketplace-closed", gameState.marketplaceClosed);
  document.body.classList.toggle("marketplace-opening-soon", gameState.shouldShowMarketplaceOpeningSoon());
  document.body.classList.toggle("final-round", gameState.isFinalRoundActive() && !gameState.gameOver);
  document.body.classList.toggle("last-turn", shouldShowLastTurnNotice());

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
  const clearAfterMs = Object.prototype.hasOwnProperty.call(options, "clearAfterMs")
    ? Math.max(0, Number(options.clearAfterMs || 0))
    : defaultGameMessageClearMilliseconds;
  const messageToken = String(gameMessageToken + 1);

  window.clearTimeout(gameMessageClearTimer);
  window.clearTimeout(gameMessageExitTimer);
  gameMessageClearTimer = null;
  gameMessageExitTimer = null;
  gameMessageToken += 1;

  if (messageElement) {
    if (!message) {
      const clearingToken = String(gameMessageToken);

      if (!messageElement.textContent) {
        messageElement.dataset.messageToken = clearingToken;
        messageElement.classList.remove("has-message", "message-exiting");
        return;
      }

      messageElement.dataset.messageToken = clearingToken;
      messageElement.classList.add("message-exiting");
      messageElement.classList.remove("has-message");
      gameMessageExitTimer = window.setTimeout(() => {
        if (messageElement.dataset.messageToken === clearingToken) {
          messageElement.textContent = "";
          messageElement.classList.remove("message-exiting");
        }
      }, gameMessageAnimationMilliseconds);
      return;
    }

    messageElement.dataset.messageToken = messageToken;
    messageElement.textContent = message;
    messageElement.classList.remove("message-exiting");
    messageElement.classList.add("has-message");

    if (clearAfterMs > 0) {
      gameMessageClearTimer = window.setTimeout(() => {
        if (messageElement.dataset.messageToken === messageToken) {
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

function isLeaderboardURLHash() {
  return window.location.hash.replace(/^#/, "").trim().toLowerCase() === "leaderboard";
}

function isChangelogURLHash() {
  return window.location.hash.replace(/^#/, "").trim().toLowerCase() === "changelog";
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

function setLeaderboardURLHash(options = {}) {
  setURLHash("#leaderboard", options);
}

function setChangelogURLHash(options = {}) {
  setURLHash("#changelog", options);
}

function clearGameURLGameId() {
  if (!window.location.hash) {
    return;
  }

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function isMyTurn() {
  const storedPlayerKey = normalizeNameKey(getStoredPlayerName());
  const loggedInPlayer = getLoggedInPlayer();

  return Boolean(storedPlayerKey) &&
    Boolean(loggedInPlayer) &&
    normalizeNameKey(gameState.currentPlayerName) === storedPlayerKey &&
    !gameState.isPlayerNameConceded(getStoredPlayerName());
}

function isSpectatorMode() {
  return spectatorMode && !isWelcomeDemoMode();
}

function isWelcomeDemoMode() {
  return document.body.classList.contains("welcome-demo");
}

function canInteractWithCurrentTurn() {
  return (!isSpectatorMode() && isMyTurn()) || isWelcomeDemoMode();
}

function shouldShowLastTurnNotice() {
  return !isWelcomeDemoMode() && isMyTurn() && gameState.isCurrentPlayerLastTurn();
}

function getLoggedInPlayer() {
  const storedPlayerKey = normalizeNameKey(getStoredPlayerName());
  const authKey = getStoredPlayerAuthKey();

  if (!storedPlayerKey && !authKey) {
    return null;
  }

  return gameState.players.find((player) => (
    player.claimed !== false &&
    !player.open &&
    (
      (storedPlayerKey && normalizeNameKey(player.name) === storedPlayerKey) ||
      (authKey && String(player.authKey || "") === authKey)
    )
  )) || null;
}

function getVisibleRack() {
  if (isSpectatorMode()) {
    return [];
  }

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

function setCookie(name, value, maxAge = storedAuthMaxAgeSeconds) {
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

function getJSONCookie(name, fallbackValue) {
  const value = getCookie(name);

  if (!value) {
    return fallbackValue;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function setJSONCookie(name, value, maxAge = storedAuthMaxAgeSeconds) {
  setCookie(name, JSON.stringify(value), maxAge);
}

function getStoredPlayerAuth() {
  const auth = parseJSONStorageItem(playerAuthStorageKey, null) ||
    getJSONCookie(playerAuthCookie, null);
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

function createIdentityTooltipLine(label, value) {
  const line = document.createElement("span");
  const labelElement = document.createElement("span");
  const valueElement = document.createElement("span");

  line.className = "identity-tooltip-line";
  labelElement.className = "identity-tooltip-label";
  labelElement.textContent = `${label}: `;
  valueElement.textContent = value;
  line.append(labelElement, valueElement);
  return line;
}

function updateIdentityAccountTooltip(auth) {
  const identityCurrent = document.querySelector(".identity-current");
  const identityNameDisplay = document.querySelector("#identity-name-display");
  const tooltip = document.querySelector("#identity-account-tooltip");
  const provider = String(auth?.provider || "");
  const providerLabel = getProviderLabel(provider);
  const userId = String(auth?.userId || "");
  const email = String(auth?.email || "");

  if (!identityNameDisplay || !tooltip || !auth?.name) {
    identityCurrent?.classList.remove("tooltip-open");
    identityNameDisplay?.removeAttribute("aria-label");
    tooltip?.replaceChildren();
    tooltip?.setAttribute("hidden", "");
    return;
  }

  const details = [
    createIdentityTooltipLine("Signed in with", providerLabel),
    createIdentityTooltipLine("Display name", auth.name)
  ];

  if (email) {
    details.push(createIdentityTooltipLine("Email", email));
  }

  if (provider !== "name" && userId) {
    details.push(createIdentityTooltipLine(`${providerLabel} ID`, userId));
  } else if (provider === "name") {
    details.push(createIdentityTooltipLine("Login", "Local name login"));
  }

  tooltip.replaceChildren(...details);
  tooltip.removeAttribute("hidden");
  identityNameDisplay.setAttribute("aria-label", `Account details for ${auth.name}`);
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
  setJSONCookie(playerAuthCookie, {
    ...normalizedAuth,
    accessToken: ""
  });
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

    return payload.found && username
      ? {
        username
      }
      : null;
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
  return window.location.protocol === "https:" && hasOAuthProviderConfig(provider);
}

function updateOAuthLoginAvailability() {
  const googleAvailable = providerLoginIsVisible("google");
  const facebookAvailable = providerLoginIsVisible("facebook");

  document.documentElement.classList.toggle("oauth-google-available", googleAvailable);
  document.documentElement.classList.toggle("oauth-facebook-available", facebookAvailable);
  document.documentElement.classList.toggle("oauth-login-available", googleAvailable || facebookAvailable);
}

async function loadOAuthConfig() {
  if (serverOAuthConfig && serverDeploymentConfig) {
    updateOAuthLoginAvailability();
    return serverOAuthConfig;
  }

  try {
    const payload = await fetchJSON(`${serverURL}?action=oauth_config`);
    serverOAuthConfig = payload.oauth && typeof payload.oauth === "object"
      ? payload.oauth
      : {};
    serverDeploymentConfig = payload.deployment && typeof payload.deployment === "object"
      ? payload.deployment
      : {};
  } catch {
    serverOAuthConfig = {};
    serverDeploymentConfig = {};
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
  const scope = typeof config.scope === "string"
    ? config.scope.trim()
    : (provider === "google" ? "openid" : "");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectURI,
    response_type: "token",
    state
  });

  if (scope) {
    params.set("scope", scope);
  }

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
  const storedLogin = await lookupStoredOAuthUserLogin(normalizedProvider, userId);
  const storedName = storedLogin?.username || "";

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
    : `https://graph.facebook.com/me?fields=id&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(endpoint, provider === "google"
    ? { headers: { Authorization: `Bearer ${accessToken}` } }
    : {});

  if (!response.ok) {
    throw new Error("Could not read OAuth profile.");
  }

  const profile = await response.json();

  return {
    userId: String(profile.sub || profile.id || ""),
    name: ""
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
  const storedLogin = await lookupStoredOAuthUserLogin(provider, userId);
  const confirmedName = getConfirmedDisplayNameForOAuth(provider, userId) ||
    storedLogin?.username || "";
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
  } else if (window.location.hash && await loadGameFromURLHash()) {
    return;
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
  return (game.players || []).some((player) => {
    const playerName = normalizePlayerName(player?.name);
    const hasAuthKey = Boolean(String(player?.authKey || "").trim());
    const isOpenByFlag = player?.open || player?.claimed === false;
    const isOpenSlotName = !playerName ||
      /^open spot \d+$/i.test(playerName) ||
      /^guest$/i.test(playerName);

    return !hasAuthKey && isOpenByFlag && isOpenSlotName;
  });
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
  document.documentElement.classList.toggle("new-games-disabled", isNewGameCreationDisabled());
  updateOAuthLoginAvailability();

  if (identityNameDisplay) {
    identityNameDisplay.textContent = playerName;
  }

  if (identityProviderDisplay) {
    identityProviderDisplay.textContent = auth?.provider && auth.provider !== "name"
      ? getProviderLabel(auth.provider)
      : "";
  }

  updateIdentityAccountTooltip(auth);

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

function isOpenPlayerSummary(player) {
  return Boolean(player?.open) ||
    player?.claimed === false ||
    /^open spot(?:\s+\d+)?$/i.test(String(player?.name || ""));
}

function getPlayerSummaryDisplayName(player) {
  return isOpenPlayerSummary(player) ? "Open Spot" : String(player?.name || "Player");
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

function renderWelcomeDemoGame() {
  if (getStoredPlayerName()) {
    document.body.classList.remove("welcome-demo", "welcome-leaderboard");
    return;
  }

  document.body.classList.remove("welcome-leaderboard");
  document.body.classList.add("welcome-demo");
  gameState.loadFromJSON(welcomeDemoGameState);
  captureTurnStartGameState();
  renderGame();
}

function setScreen(screenName, options = {}) {
  const shouldClearGameURL = options.clearGameURL !== false;

  if (screenName !== "play") {
    window.clearTimeout(immediateTurnRefreshTimer);
    immediateTurnRefreshTimer = null;
    spectatorMode = false;
  }

  document.body.classList.remove("screen-welcome", "screen-display-name", "screen-setup", "screen-list", "screen-leaderboard", "screen-play", "screen-rules", "screen-changelog");
  document.body.classList.remove("welcome-demo", "welcome-leaderboard");
  document.body.classList.toggle("spectator-mode", spectatorMode && screenName === "play");
  document.body.classList.add(`screen-${screenName}`);

  if (screenName !== "play") {
    document.body.classList.remove("game-over");
    setConcedeConfirmationVisible(false);
  }

  if (screenName !== "play" && shouldClearGameURL) {
    clearGameURLGameId();
  }

  closeIdentityMenu();
  renderWaitingGamesMenu();
  updateTurnPolling();
  updateGameListRefreshTimer();

  if (screenName === "welcome") {
    renderWelcomeDemoGame();
  }
}

function showRules(options = {}) {
  setGameMessage("");
  setScreen("rules", { clearGameURL: false });

  if (options.updateURL !== false) {
    setRulesURLHash({ replace: options.replaceURL === true });
  }
}

function showChangelog(options = {}) {
  setGameMessage("");
  setScreen("changelog", { clearGameURL: false });

  if (options.updateURL !== false) {
    setChangelogURLHash({ replace: options.replaceURL === true });
  }
}

function showNewGameSetup(options = {}) {
  requirePlayerName(() => {
    if (isNewGameCreationDisabled()) {
      setGameMessage("");
      setScreen("setup", { clearGameURL: false });

      if (options.updateURL !== false) {
        setNewGameURLHash({ replace: options.replaceURL === true });
      }

      return;
    }

    renderPlayerNameInputs([
      getStoredPlayerName(),
      "Guest"
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

function formatLeaderboardNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatLeaderboardHighlightWord(highlight) {
  return String(highlight?.word || "").trim().toUpperCase();
}

function formatLeaderboardHighlightPlayer(highlight) {
  return String(highlight?.playerName || "").trim() || "Player";
}

function formatLeaderboardHighlightWords(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => String(word || "").trim().toUpperCase())
    .filter(Boolean);
}

function getLeaderboardHighlightGameId(highlight) {
  const gameId = String(highlight?.gameId || "").trim().toUpperCase();

  return /^[A-Z0-9]{5}$/.test(gameId) ? gameId : "";
}

function createLeaderboardHighlightItem(label, value, detail, words = [], options = {}) {
  const gameId = getLeaderboardHighlightGameId(options.highlight);
  const item = document.createElement(gameId ? "a" : "div");
  const labelElement = document.createElement("span");
  const valueElement = document.createElement("strong");
  const detailElement = document.createElement("span");
  const wordList = document.createElement("div");
  const hasWordList = () => wordList.childElementCount > 0;

  item.className = "leaderboard-highlight-item";
  if (gameId) {
    item.classList.add("leaderboard-highlight-link");
    item.href = `#${gameId}`;
    item.setAttribute("aria-label", `${label} highlight from game ${gameId}`);
  }
  labelElement.className = "leaderboard-highlight-label";
  labelElement.textContent = label;
  valueElement.className = "leaderboard-highlight-value";
  valueElement.textContent = value || "-";
  detailElement.className = "leaderboard-highlight-detail";
  detailElement.textContent = detail || options.emptyDetail || "No plays yet";
  wordList.className = "leaderboard-highlight-words";
  if (options.wordsAsValue) {
    item.classList.add("leaderboard-highlight-item-words-value");
  }
  formatLeaderboardHighlightWords(words).forEach((word) => {
    const wordElement = document.createElement("span");

    wordElement.textContent = word;
    wordList.append(wordElement);
  });
  item.append(labelElement);

  if (value || !options.hideEmptyValue) {
    item.append(valueElement);
  }

  if (options.wordsAsValue && hasWordList()) {
    item.append(wordList);

    if (detail) {
      item.append(detailElement);
    }

    return item;
  }

  if (detail || !hasWordList()) {
    item.append(detailElement);
  }

  if (hasWordList()) {
    item.append(wordList);
  }

  return item;
}

function renderLeaderboardHighlights(leaderboard, highlightsElement) {
  const highlights = leaderboard?.highlights || {};
  const recent = highlights.recent || null;
  const longest = highlights.longest || null;
  const mostStacked = highlights.mostStacked || null;
  const highestPoints = highlights.highestPoints || null;
  const highestGameScore = highlights.highestGameScore || null;
  const mostWords = highlights.mostWords || null;
  const recentWord = formatLeaderboardHighlightWord(recent);
  const longestWord = formatLeaderboardHighlightWord(longest);
  const highestWord = formatLeaderboardHighlightWord(highestPoints);
  const stackDepth = Number(mostStacked?.stackDepth || 0);
  const mostWordCount = Number(mostWords?.wordCount || 0);

  highlightsElement.replaceChildren(
    createLeaderboardHighlightItem(
      "Recent",
      "",
      recentWord
        ? `${formatLeaderboardHighlightPlayer(recent)} scored ${formatLeaderboardNumber(recent?.score)}`
        : "",
      recent?.words,
      { hideEmptyValue: true, wordsAsValue: true, highlight: recent }
    ),
    createLeaderboardHighlightItem(
      "Longest",
      longestWord,
      longestWord
        ? `${formatLeaderboardNumber(longest?.wordLength || longestWord.length)} letters by ${formatLeaderboardHighlightPlayer(longest)}`
        : "",
      [],
      { highlight: longest }
    ),
    createLeaderboardHighlightItem(
      "Most Stacked",
      "",
      "",
      mostStacked?.words,
      { hideEmptyValue: true, wordsAsValue: true, highlight: mostStacked }
    ),
    createLeaderboardHighlightItem(
      "Highest Play",
      Number(highestPoints?.score || 0) > 0 ? formatLeaderboardNumber(highestPoints?.score) : "",
      highestWord
        ? `${highestWord} by ${formatLeaderboardHighlightPlayer(highestPoints)}`
        : "",
      [],
      { highlight: highestPoints }
    ),
    createLeaderboardHighlightItem(
      "Highest Score",
      Number(highestGameScore?.score || 0) > 0 ? formatLeaderboardNumber(highestGameScore?.score) : "",
      Number(highestGameScore?.score || 0) > 0
        ? formatLeaderboardHighlightPlayer(highestGameScore)
        : "",
      [],
      { highlight: highestGameScore }
    ),
    createLeaderboardHighlightItem(
      "Most Words",
      "",
      mostWordCount > 0
        ? `${formatLeaderboardNumber(mostWords?.score)} points by ${formatLeaderboardHighlightPlayer(mostWords)}`
        : "",
      mostWords?.words,
      {
        hideEmptyValue: true,
        wordsAsValue: true,
        highlight: mostWords,
        emptyDetail: "No words yet"
      }
    )
  );
}

function renderLeaderboard(leaderboard) {
  const summaryElement = document.querySelector("#leaderboard-summary");
  const highlightsElement = document.querySelector("#leaderboard-highlights");
  const tableElement = document.querySelector("#leaderboard-table");
  const players = (Array.isArray(leaderboard?.players) ? leaderboard.players : []).slice(0, 20);

  if (!summaryElement || !highlightsElement || !tableElement) {
    return;
  }

  summaryElement.replaceChildren();
  highlightsElement.replaceChildren();
  tableElement.replaceChildren();

  [
    ["Games Played", leaderboard?.totalGamesPlayed],
    ["Active Games", leaderboard?.totalActiveGames],
    ["Players", Array.isArray(leaderboard?.players) ? leaderboard.players.length : 0]
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    const valueElement = document.createElement("span");
    const labelElement = document.createElement("span");

    item.className = "leaderboard-summary-item";
    valueElement.className = "leaderboard-summary-value";
    valueElement.textContent = formatLeaderboardNumber(value);
    labelElement.className = "leaderboard-summary-label";
    labelElement.textContent = label;
    item.append(valueElement, labelElement);
    summaryElement.append(item);
  });

  renderLeaderboardHighlights(leaderboard, highlightsElement);

  if (players.length === 0) {
    const emptyElement = document.createElement("div");

    emptyElement.className = "leaderboard-empty";
    emptyElement.textContent = "No player stats yet.";
    tableElement.append(emptyElement);
    return;
  }

  const header = document.createElement("div");

  header.className = "leaderboard-row leaderboard-header";
  ["Rank", "Player", "Total Score", "Games", "Active"].forEach((label) => {
    const cell = document.createElement("span");

    cell.textContent = label;
    header.append(cell);
  });
  tableElement.append(header);

  players.forEach((player, index) => {
    const row = document.createElement("div");
    const values = [
      `#${index + 1}`,
      String(player?.name || "Player"),
      formatLeaderboardNumber(player?.totalScore),
      formatLeaderboardNumber(player?.games),
      formatLeaderboardNumber(player?.activeGames)
    ];

    row.className = "leaderboard-row";
    values.forEach((value) => {
      const cell = document.createElement("span");

      cell.textContent = value;
      row.append(cell);
    });
    tableElement.append(row);
  });
}

async function loadLeaderboard() {
  const tableElement = document.querySelector("#leaderboard-table");

  if (tableElement) {
    tableElement.textContent = "Loading leaderboard...";
  }

  try {
    const payload = await fetchJSON(`${serverURL}?action=leaderboard`);

    renderLeaderboard(payload.leaderboard || {});
  } catch (error) {
    if (tableElement) {
      tableElement.textContent = `Could not load leaderboard: ${error.message}`;
    }
  }
}

async function showLeaderboard(options = {}) {
  setGameMessage("");
  setScreen("leaderboard", { clearGameURL: false });

  if (options.updateURL !== false) {
    setLeaderboardURLHash({ replace: options.replaceURL === true });
  }

  await loadLeaderboard();
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

  const auth = getStoredPlayerAuth();
  const provider = String(auth?.provider || (auth ? "name" : ""));

  if (!auth || provider === "name") {
    deleteCookie(playerNameCookie);
    deleteCookie(playerAuthCookie);
    removeLocalStorageItem(playerNameStorageKey);
    removeLocalStorageItem(playerAuthStorageKey);
  }
}

function clearStoredPlayerIdentity() {
  deleteCookie(playerNameCookie);
  deleteCookie(playerAuthCookie);
  removeLocalStorageItem(playerNameStorageKey);
  removeLocalStorageItem(playerAuthStorageKey);
}

function logoutPlayer() {
  clearStoredPlayerIdentity();
  pendingIdentityAction = null;
  closeIdentityMenu();
  setWaitingGamesForMenu([]);
  setScreen("welcome");
  setGameMessage("");
  updateIdentityUI();
  loadActiveGames();
}

function handleMissingStoredIdentity(options = {}) {
  pendingIdentityAction = null;
  closeIdentityMenu();
  setWaitingGamesForMenu([]);
  setScreen("welcome");
  setGameMessage(options.message || "");
  updateIdentityUI();
}

function handleInvalidLogin(error) {
  clearStoredPlayerIdentity();
  pendingIdentityAction = null;
  closeIdentityMenu();
  setWaitingGamesForMenu([]);
  setScreen("welcome");
  setGameMessage("Please login again to continue", { clearAfterMs: 0 });
  updateIdentityUI();
}

function handleIdentityStorageChange(event) {
  if (![playerNameStorageKey, playerAuthStorageKey].includes(event.key)) {
    return;
  }

  updateIdentityUI();

  if (!getStoredPlayerName() && document.body.classList.contains("screen-list")) {
    handleMissingStoredIdentity({ message: "Please login again to continue" });
  }
}

function isAuthInvalidError(error) {
  if (error?.authInvalid) {
    return true;
  }

  const message = String(error?.message || "").toLowerCase();

  return /\blogin\b/.test(message) &&
    (
      /\bsession\b/.test(message) ||
      /\btoken\b/.test(message) ||
      /\bauth/.test(message)
    ) &&
    (
      /\binvalid\b/.test(message) ||
      /\brejected\b/.test(message) ||
      /\bnot registered\b/.test(message)
    );
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
    const error = new Error(payload.error || "Server request failed.");

    error.status = response.status;
    error.authInvalid = Boolean(payload.authInvalid);
    throw error;
  }

  return payload;
}

function mergePlayerMetadataFromState(sourceState) {
  const sourcePlayers = Array.isArray(sourceState?.players) ? sourceState.players : [];

  if (sourcePlayers.length === 0) {
    return false;
  }

  let changed = false;

  sourcePlayers.forEach((sourcePlayer, index) => {
    const player = gameState.players[index];

    if (!player || !sourcePlayer) {
      return;
    }

    const normalizedSource = {
      name: String(sourcePlayer.name || player.name || "Player"),
      invitedName: normalizePlayerName(sourcePlayer.invitedName || ""),
      authKey: String(sourcePlayer.authKey || ""),
      provider: String(sourcePlayer.provider || ""),
      claimed: sourcePlayer.claimed !== false && !sourcePlayer.open,
      open: sourcePlayer.claimed === false || Boolean(sourcePlayer.open)
    };

    Object.entries(normalizedSource).forEach(([key, value]) => {
      if (player[key] !== value) {
        player[key] = value;
        changed = true;
      }
    });
  });

  return changed;
}

function createAuthenticatedGameParams(entries = {}) {
  const auth = getStoredPlayerAuth();

  return new URLSearchParams({
    ...entries,
    playerName: getStoredPlayerName(),
    authKey: getStoredPlayerAuthKey(),
    sessionToken: auth?.sessionToken || ""
  });
}

function createPublicGameParams(entries = {}) {
  return new URLSearchParams(entries);
}

async function saveGameState() {
  if (isSpectatorMode()) {
    throw new Error("Spectators cannot save this game.");
  }

  const params = createAuthenticatedGameParams({
    action: "save"
  });
  let payload = null;

  try {
    payload = await fetchJSON(`${serverURL}?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(gameState.toJSON())
    });
  } catch (error) {
    if (isAuthInvalidError(error)) {
      handleInvalidLogin(error);
    }

    throw error;
  }

  if (payload.stale) {
    throw new Error(payload.error || "Save ignored because a newer turn is already stored.");
  }

  if (payload.lastPlayDate) {
    gameState.lastPlayDate = payload.lastPlayDate;
  }

  if (mergePlayerMetadataFromState(payload.gameState)) {
    updateInviteLinkUI();
    renderScore();
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
    isSpectatorMode() ||
    isMyTurn() ||
    gameState.gameOver ||
    !/^[A-Z0-9]{5}$/.test(gameState.id)
  ) {
    updateTurnPolling();
    return;
  }

  try {
    const params = createAuthenticatedGameParams({
      action: "load",
      id: gameState.id,
      turnIndex: String(gameState.turnIndex)
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
    const wasMarketplaceClosed = gameState.marketplaceClosed;
    const wasFinalRoundActive = gameState.isFinalRoundActive();
    const wasCurrentPlayerLastTurn = gameState.isCurrentPlayerLastTurn();
    const wasLastTurnNoticeVisible = shouldShowLastTurnNotice();
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
      gameState.hasPendingMarketplacePurchases() ||
      wasMarketplaceClosed !== gameState.marketplaceClosed ||
      wasFinalRoundActive !== gameState.isFinalRoundActive() ||
      wasCurrentPlayerLastTurn !== gameState.isCurrentPlayerLastTurn() ||
      wasLastTurnNoticeVisible !== shouldShowLastTurnNotice();

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
    if (isAuthInvalidError(error)) {
      handleInvalidLogin(error);
      return;
    }

    setGameMessage(`Could not refresh game: ${error.message}`);
  } finally {
    updateTurnPolling();
  }
}

function updateTurnPolling() {
  const shouldPoll = document.body.classList.contains("screen-play") && !isSpectatorMode() && !isMyTurn() && !gameState.gameOver;
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

  if (isSpectatorMode()) {
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

function getVisibleWaitingGamesForMenu() {
  const currentGameId = document.body.classList.contains("screen-play")
    ? String(gameState.id || "").trim().toUpperCase()
    : "";

  if (!currentGameId) {
    return waitingGamesForMenu;
  }

  return waitingGamesForMenu.filter((game) => String(game?.id || "").trim().toUpperCase() !== currentGameId);
}

async function refreshWaitingGamesForMenu() {
  const playerName = getStoredPlayerName();

  if (!playerName) {
    setWaitingGamesForMenu([]);
    return;
  }

  try {
    const params = createAuthenticatedGameParams({
      action: "list"
    });
    const payload = await fetchJSON(`${serverURL}?${params.toString()}`);

    setWaitingGamesForMenu(payload.games || []);
  } catch (error) {
    if (isAuthInvalidError(error)) {
      handleInvalidLogin(error);
    }
    // Keep the last successful badge state instead of flashing it away on a transient refresh failure.
  }
}

function renderWaitingGamesMenu() {
  const menuButton = document.querySelector("#identity-menu-button");
  const notificationCount = document.querySelector("#menu-notification-count");
  const waitingGamesElement = document.querySelector("#menu-waiting-games");
  const visibleWaitingGames = getVisibleWaitingGamesForMenu();
  const count = visibleWaitingGames.length;

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

  visibleWaitingGames.forEach((game) => {
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
    if (document.body.classList.contains("screen-list")) {
      handleMissingStoredIdentity({ message: "Please login again to continue" });
    }
    return;
  }

  loadingActiveGames = true;

  try {
    const params = createAuthenticatedGameParams({
      action: "list"
    });
    const payload = await fetchJSON(`${serverURL}?${params.toString()}`);
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
          playerNameElement.textContent = getPlayerSummaryDisplayName(player);
          playerElement.append(playerNameElement);

          if (player.score !== null && Number(player.score) !== 0) {
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
    if (isAuthInvalidError(error)) {
      activeGamesList.textContent = "";
      handleInvalidLogin(error);
      return;
    }

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

  const params = createAuthenticatedGameParams({
    action: "load",
    id: normalizedGameId
  });
  let payload = null;

  try {
    payload = await fetchJSON(`${serverURL}?${params.toString()}`);
  } catch (error) {
    if (isAuthInvalidError(error)) {
      handleInvalidLogin(error);
      const publicParams = createPublicGameParams({
        action: "load",
        id: normalizedGameId
      });

      payload = await fetchJSON(`${serverURL}?${publicParams.toString()}`);
    } else {
      throw error;
    }
  }
  const auth = getStoredPlayerAuth();
  let claimedSpot = false;

  gameState.loadFromJSON(payload.gameState);
  const canPlayGame = Boolean(getLoggedInPlayer());

  if (!canPlayGame && auth?.name) {
    claimedSpot = claimGameSpot(payload.gameState, auth);

    if (claimedSpot) {
      gameState.loadFromJSON(payload.gameState);
    }
  }

  spectatorMode = !canPlayGame && !claimedSpot;
  rememberFriendsFromGame(gameState.toJSON());
  captureTurnStartGameState();
  setScreen("play");
  setGameURLGameId(gameState.id);
  setGameMessage("");
  renderGame();
  setWaitingGamesForMenu(spectatorMode ? [] : payload.waitingGames || [], { trusted: true });

  if (claimedSpot) {
    await saveGameState();
    setGameMessage(`Claimed a spot in game ${gameState.id}.`);
  }
}

async function resumeGame(gameId) {
  try {
    await loadGameById(gameId);
  } catch (error) {
    if (isAuthInvalidError(error)) {
      return;
    }

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

  if (isLeaderboardURLHash()) {
    await showLeaderboard({ updateURL: false });
    return true;
  }

  if (isChangelogURLHash()) {
    showChangelog({ updateURL: false });
    return true;
  }

  if (!gameId) {
    setScreen("welcome");
    clearGameURLGameId();
    setGameMessage("Could not load game: the URL game ID must be 5 letters or numbers.");
    return false;
  }

  loadingGameFromURL = true;

  try {
    await loadGameById(gameId);
    return true;
  } catch (error) {
    if (isAuthInvalidError(error)) {
      return false;
    }

    setScreen("welcome");
    clearGameURLGameId();
    setGameMessage(`Could not load game ${gameId}: ${error.message}`);
    return false;
  } finally {
    loadingGameFromURL = false;
  }
}

async function startNewGame() {
  if (isNewGameCreationDisabled()) {
    setGameMessage("Create new games at WordWefter.com.");
    window.location.assign("https://wordwefter.com/");
    return;
  }

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
    if (isAuthInvalidError(error)) {
      return;
    }

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
    if (isAuthInvalidError(error)) {
      return;
    }

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
    if (isAuthInvalidError(error)) {
      return;
    }

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
    if (isAuthInvalidError(error)) {
      return;
    }

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
  if (!document.body.classList.contains("screen-play") && !isWelcomeDemoMode()) {
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
      if (isAuthInvalidError(error)) {
        return;
      }

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

function closeIdentityTooltip() {
  document.querySelector(".identity-current")?.classList.remove("tooltip-open");
}

function toggleIdentityTooltip(event) {
  const identityCurrent = document.querySelector(".identity-current");
  const tooltip = document.querySelector("#identity-account-tooltip");

  if (!identityCurrent || !tooltip || tooltip.hasAttribute("hidden")) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  identityCurrent.classList.toggle("tooltip-open");
}

function closeIdentityTooltipOnOutsideClick(event) {
  const identityCurrent = document.querySelector(".identity-current");

  if (!identityCurrent?.classList.contains("tooltip-open")) {
    return;
  }

  if (identityCurrent.contains(event.target)) {
    return;
  }

  closeIdentityTooltip();
}

function closeIdentityTooltipOnEscape(event) {
  if (event.key === "Escape") {
    closeIdentityTooltip();
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

  const canPlay = canInteractWithCurrentTurn() && !gameState.gameOver;

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

  if (!marketplace || !window.Sortable || !canInteractWithCurrentTurn() || gameState.gameOver) {
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
  if (!window.Sortable || !canInteractWithCurrentTurn() || gameState.gameOver) {
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
  const showPublicLeaderboardButton = document.querySelector("#show-public-leaderboard-button");
  const identityNameInput = document.querySelector("#identity-name-input");
  const identityNameDisplay = document.querySelector("#identity-name-display");
  const oauthDisplayNameInput = document.querySelector("#oauth-display-name-input");
  const saveOAuthDisplayNameButton = document.querySelector("#save-oauth-display-name-button");
  const identityMenuButton = document.querySelector("#identity-menu-button");
  const logoutButton = document.querySelector("#logout-button");
  const showNewGameButton = document.querySelector("#show-new-game-button");
  const showGameListButton = document.querySelector("#show-game-list-button");
  const showLeaderboardButton = document.querySelector("#show-leaderboard-button");
  const showRulesButton = document.querySelector("#show-rules-button");
  const showChangelogButton = document.querySelector("#show-changelog-button");
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

  if (showPublicLeaderboardButton) {
    showPublicLeaderboardButton.addEventListener("click", () => {
      void showLeaderboard();
    });
  }

  if (identityNameInput) {
    identityNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        saveIdentityFromInput();
      }
    });
  }

  if (identityNameDisplay) {
    identityNameDisplay.addEventListener("click", toggleIdentityTooltip);
    identityNameDisplay.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        toggleIdentityTooltip(event);
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
  document.addEventListener("click", closeIdentityTooltipOnOutsideClick);
  document.addEventListener("keydown", closeIdentityTooltipOnEscape);

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

  if (showLeaderboardButton) {
    showLeaderboardButton.addEventListener("click", () => {
      closeIdentityMenu();
      void showLeaderboard();
    });
  }

  if (showRulesButton) {
    showRulesButton.addEventListener("click", () => {
      closeIdentityMenu();
      showRules();
    });
  }

  if (showChangelogButton) {
    showChangelogButton.addEventListener("click", () => {
      closeIdentityMenu();
      showChangelog();
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
  await loadOAuthConfig();
  clearDisallowedLegacyNameLogin();
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
  animateBrandEfterTiles();
  const loadedHashGame = await loadGameFromURLHash();

  if (!loadedHashGame) {
    if (getStoredPlayerName()) {
      await showGameList({ replaceURL: true });
    } else {
      renderWelcomeDemoGame();
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
window.addEventListener("storage", handleIdentityStorageChange);

window.addEventListener("hashchange", async () => {
  if (!window.location.hash) {
    setGameMessage("");

    if (getStoredPlayerName()) {
      await showGameList({ replaceURL: true });
    } else {
      setScreen("welcome");
    }

    return;
  }

  await loadGameFromURLHash();
});


export { WordWefterGameState, gameState };
