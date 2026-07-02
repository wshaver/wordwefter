import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compileDictionary } from "./build-dictionary.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wordwefter-dict-build-"));
const dictDir = path.join(tempRoot, "dicts");
const outputFile = path.join(tempRoot, "dictionary.js");

try {
  fs.mkdirSync(dictDir);
  fs.writeFileSync(path.join(dictDir, "base.txt"), [
    "100 QI",
    "za",
    "MIDWIT",
    "BAD-WORD",
    "",
    "42 MOCHI"
  ].join("\n"));
  fs.writeFileSync(path.join(dictDir, "extra.txt"), [
    "QI",
    "Tagine",
    "MOCHI",
    "123"
  ].join("\n"));

  const result = compileDictionary({ dictDir, outputFile });
  const moduleText = fs.readFileSync(outputFile, "utf8");

  assert.deepEqual(
    result.words,
    ["QI", "ZA", "MIDWIT", "MOCHI", "TAGINE"],
    "dictionary build should strip numeric prefixes, uppercase words, skip invalid entries, and remove duplicates"
  );
  assert.equal(result.sourceFiles, 2, "dictionary build should read every txt file in the dictionary directory");
  assert.match(moduleText, /const dictionaryWords = \[/, "generated dictionary should define dictionaryWords");
  assert.match(moduleText, /export \{ dictionaryWords, dictionaryWordSet \};/, "generated dictionary should export the word list and set");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Dictionary build checks passed.");
