const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const prodDist = path.join(root, "public", "dist");
const testDist = path.join(root, "public", "dist-test");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const prodGame = readIfExists(path.join(prodDist, "game.js"));
const testGame = readIfExists(path.join(testDist, "game.js"));

assert(fs.existsSync(path.join(prodDist, "game.js")), "Production build should emit public/dist/game.js.");
assert(!fs.existsSync(path.join(prodDist, "test-hooks.js")), "Production build should not emit test-hooks.js.");
assert(!prodGame.includes("test-hooks"), "Production game bundle should not reference test hooks.");
assert(!prodGame.includes("wordWefterTest"), "Production game bundle should not include test globals.");

assert(fs.existsSync(path.join(testDist, "game.js")), "Test build should emit public/dist-test/game.js.");
assert(fs.existsSync(path.join(testDist, "test-hooks.js")), "Test build should emit test-hooks.js.");
assert(testGame.includes("test-hooks"), "Test game bundle should reference the test-hooks chunk.");

console.log("Build variant checks passed.");
