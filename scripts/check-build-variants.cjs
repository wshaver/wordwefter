const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const prodDist = path.join(root, "public", "dist");
const testDist = path.join(root, "public", "dist-test");
const indexHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

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
const prodFiles = fs.existsSync(prodDist) ? fs.readdirSync(prodDist) : [];
const hashedProdGameFiles = prodFiles.filter((fileName) => /^game-[a-zA-Z0-9_-]+\.js$/.test(fileName));
const hashedProdStyleFiles = prodFiles.filter((fileName) => /^styles-[a-f0-9]{8}\.css$/.test(fileName));
const hashedProdGame = hashedProdGameFiles.length === 1
  ? readIfExists(path.join(prodDist, hashedProdGameFiles[0]))
  : "";

assert(hashedProdGameFiles.length === 1, "Production build should emit exactly one hashed public/dist/game-*.js file.");
assert(hashedProdStyleFiles.length === 1, "Production build should emit exactly one hashed public/dist/styles-*.css file.");
assert(!fs.existsSync(path.join(prodDist, "game.js")), "Production build should not emit stable public/dist/game.js.");
assert(!fs.existsSync(path.join(prodDist, "styles.css")), "Production build should not emit stable public/dist/styles.css.");
assert(!fs.existsSync(path.join(prodDist, "test-hooks.js")), "Production build should not emit test-hooks.js.");
assert(!hashedProdGame.includes("test-hooks"), "Production game bundle should not reference test hooks.");
assert(!hashedProdGame.includes("wordWefterTest"), "Production game bundle should not include test globals.");
assert(indexHtml.includes(`./dist/${hashedProdGameFiles[0]}`), "Index should reference the hashed production game bundle.");
assert(indexHtml.includes(`./dist/${hashedProdStyleFiles[0]}`), "Index should reference the hashed production stylesheet.");
assert(!/dist\/game\.js(?:\?|")/.test(indexHtml), "Index should not reference stable dist/game.js.");
assert(!/styles\.css\?v=/.test(indexHtml), "Index should not use manual stylesheet cache-busting tokens.");

assert(fs.existsSync(path.join(testDist, "game.js")), "Test build should emit public/dist-test/game.js.");
assert(fs.existsSync(path.join(testDist, "test-hooks.js")), "Test build should emit test-hooks.js.");
assert(testGame.includes("test-hooks"), "Test game bundle should reference the test-hooks chunk.");

console.log("Build variant checks passed.");
