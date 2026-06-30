const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const gameJs = fs.readFileSync(path.join(root, "src", "game.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");

function assertNotIncludes(source, text, message) {
  if (source.includes(text)) {
    console.error(message);
    process.exit(1);
  }
}

assertNotIncludes(indexHtml, "class=\"marketplace-cost-badge\"", "Marketplace cost-range badge markup should be removed.");
assertNotIncludes(indexHtml, "Costs:", "Marketplace should not render the top-right Costs tag.");
assertNotIncludes(gameJs, "marketplaceCostBadge", "Marketplace renderer should not preserve a removed cost badge.");
assertNotIncludes(stylesCss, ".marketplace-cost-badge", "Unused marketplace cost badge styles should be removed.");

console.log("Marketplace cost badge removal checks passed.");
