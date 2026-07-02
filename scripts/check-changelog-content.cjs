const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");

function assertIncludes(text, message) {
  if (!indexHtml.includes(text)) {
    console.error(message);
    process.exit(1);
  }
}

assertIncludes("Opening Soon Marketplace", "Changelog should describe opening soon marketplace behavior.");
assertIncludes("Opening Soon sign", "Changelog should mention the opening soon sign.");
assertIncludes("Marketplace Tile Return", "Changelog should describe marketplace tile return behavior.");
assertIncludes("immediate refill", "Changelog should mention immediate marketplace refill exclusion.");
assertIncludes("Marketplace Turn Pricing", "Changelog should describe marketplace turn pricing.");
assertIncludes("June 30, 2026", "Changelog entries should include dates.");
assertIncludes("Bonus Square Placement", "Changelog should describe bonus square placement.");
assertIncludes("center row or center column", "Changelog should mention center-line bonus exclusion.");
assertIncludes("Letter Point Spread", "Changelog should describe the wider letter point spread.");
assertIncludes("Letter Point Rebalance", "Changelog should describe letter point rebalance.");
assertIncludes("1-to-7 scale", "Changelog should mention the new 1-to-7 letter scale.");
assertIncludes("Q stands alone at 7 points", "Changelog should mention the 7-point Q ceiling.");

console.log("Changelog content checks passed.");
