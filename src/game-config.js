import { dictionaryWordSet } from "./generated/dictionary.js";
import { letter_points, letters_available } from "./letter-setup.js";

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
const blankTileLetter = " ";
const playableLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const vowelLetters = new Set(["A", "E", "I", "O", "U"]);
const wildcardPoolFrequency = 14;
const rackRainbowProbability = 1 / 14;
const boardSize = 9;
const startCell = {
  row: Math.floor(boardSize / 2),
  column: Math.floor(boardSize / 2)
};

function isVowelLetter(letter) {
  return vowelLetters.has(String(letter || "").toUpperCase());
}

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
  const blankTileCount = wildcardCount;
  const targetPlayableTotal = Math.max(1, targetTotal - wildcardCount - blankTileCount);

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
    [blankTileLetter]: blankTileCount,
    ...scaledLetters.reduce((counts, entry) => {
      counts[entry.letter] = entry.count;
      return counts;
    }, {})
  };
}

export {
  bonusTypes,
  gameLengthSettings,
  wildcardLetter,
  blankTileLetter,
  playableLetters,
  vowelLetters,
  wildcardPoolFrequency,
  rackRainbowProbability,
  boardSize,
  startCell,
  isVowelLetter,
  normalizeGameLength,
  createLettersAvailableForGameLength,
  dictionaryWordSet,
  letter_points,
  letters_available
};
