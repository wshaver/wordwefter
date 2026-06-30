const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const distRoot = path.join(publicRoot, "dist");
const indexPath = path.join(publicRoot, "index.html");
const stylesPath = path.join(publicRoot, "styles.css");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getSingleFile(pattern, description) {
  const matches = fs.readdirSync(distRoot)
    .filter((fileName) => pattern.test(fileName));

  if (matches.length !== 1) {
    fail(`Expected exactly one ${description}, found ${matches.length}.`);
  }

  return matches[0];
}

function contentHash(source) {
  return crypto
    .createHash("sha256")
    .update(source)
    .digest("hex")
    .slice(0, 8);
}

if (!fs.existsSync(distRoot)) {
  fail("Missing production dist directory.");
}

if (!fs.existsSync(indexPath)) {
  fail("Missing public/index.html.");
}

if (!fs.existsSync(stylesPath)) {
  fail("Missing public/styles.css.");
}

for (const fileName of fs.readdirSync(distRoot)) {
  if (/^styles-[a-f0-9]{8}\.css$/.test(fileName)) {
    fs.unlinkSync(path.join(distRoot, fileName));
  }
}

const gameFileName = getSingleFile(/^game-[a-zA-Z0-9_-]+\.js$/, "hashed production game bundle");
const stylesSource = fs.readFileSync(stylesPath);
const stylesFileName = `styles-${contentHash(stylesSource)}.css`;

fs.writeFileSync(path.join(distRoot, stylesFileName), stylesSource);

let indexHtml = fs.readFileSync(indexPath, "utf8");
indexHtml = indexHtml.replace(
  /<link rel="stylesheet" href="\.\/(?:dist\/)?styles(?:-[a-f0-9]{8})?\.css(?:\?v=[^"]*)?">/,
  `<link rel="stylesheet" href="./dist/${stylesFileName}">`
);
indexHtml = indexHtml.replace(
  /<script type="module" src="\.\/dist\/game(?:-[a-zA-Z0-9_-]+)?\.js(?:\?v=[^"]*)?"><\/script>/,
  `<script type="module" src="./dist/${gameFileName}"></script>`
);

if (!indexHtml.includes(`./dist/${stylesFileName}`)) {
  fail("Could not update index stylesheet reference.");
}

if (!indexHtml.includes(`./dist/${gameFileName}`)) {
  fail("Could not update index game bundle reference.");
}

fs.writeFileSync(indexPath, indexHtml);
console.log(`Updated index.html asset references: ${stylesFileName}, ${gameFileName}`);
