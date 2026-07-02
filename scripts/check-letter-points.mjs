import assert from "node:assert/strict";
import { letter_points } from "../src/letter-setup.js";

const expectedLetterPoints = {
  "?": 0,
  A: 1,
  B: 4,
  C: 2,
  D: 3,
  E: 1,
  F: 4,
  G: 3,
  H: 2,
  I: 1,
  J: 5,
  K: 4,
  L: 2,
  M: 3,
  N: 2,
  O: 1,
  P: 3,
  Q: 5,
  R: 2,
  S: 2,
  T: 2,
  U: 2,
  V: 4,
  W: 4,
  X: 5,
  Y: 3,
  Z: 5
};

assert.deepEqual(letter_points, expectedLetterPoints, "letter points should use the 1-to-5 less-top-heavy distribution");
assert.equal(Math.min(...Object.entries(letter_points).filter(([letter]) => letter !== "?").map(([, points]) => points)), 1);
assert.equal(Math.max(...Object.values(letter_points)), 5);
assert.equal(
  Object.entries(letter_points).filter(([letter, points]) => letter !== "?" && points === 1).length,
  4,
  "only A, E, I, and O should be 1-point letters"
);

console.log("Letter point checks passed.");
