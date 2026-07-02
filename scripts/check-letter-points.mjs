import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { letter_points } from "../src/letter-setup.js";

const expectedLetterPoints = {
  "?": 0,
  A: 1,
  B: 4,
  C: 3,
  D: 3,
  E: 1,
  F: 4,
  G: 3,
  H: 2,
  I: 1,
  J: 6,
  K: 5,
  L: 2,
  M: 3,
  N: 2,
  O: 1,
  P: 3,
  Q: 7,
  R: 2,
  S: 2,
  T: 2,
  U: 2,
  V: 5,
  W: 5,
  X: 6,
  Y: 3,
  Z: 6
};

assert.deepEqual(letter_points, expectedLetterPoints, "letter points should use the 1-to-7 wider distribution");
assert.equal(Math.min(...Object.entries(letter_points).filter(([letter]) => letter !== "?").map(([, points]) => points)), 1);
assert.equal(Math.max(...Object.values(letter_points)), 7);
assert.equal(
  Object.entries(letter_points).filter(([letter, points]) => letter !== "?" && points === 1).length,
  4,
  "only A, E, I, and O should be 1-point letters"
);
assert.equal(letter_points.Q, 7, "Q should be the only 7-point letter");
assert.equal(
  Object.entries(letter_points).filter(([, points]) => points === 7).length,
  1,
  "only one letter should top out at 7 points"
);

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = fs.readFileSync(path.join(rootDir, "public", "index.html"), "utf8");
const expectedRulesRows = [
  ["0", "?"],
  ["1", "A, E, I, O"],
  ["2", "H, L, N, R, S, T, U"],
  ["3", "C, D, G, M, P, Y"],
  ["4", "B, F"],
  ["5", "K, V, W"],
  ["6", "J, X, Z"],
  ["7", "Q"]
];

assert.match(indexHtml, /<h3>Letter Point Values<\/h3>/, "rules should include a letter point values card");
for (const [points, letters] of expectedRulesRows) {
  assert.match(
    indexHtml,
    new RegExp(`<tr>\\s*<th scope="row">${points}<\\/th>\\s*<td>${letters.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/td>\\s*<\\/tr>`),
    `rules should list ${letters} as ${points}-point letters`
  );
}

console.log("Letter point checks passed.");
