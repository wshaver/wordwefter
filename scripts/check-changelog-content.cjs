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

assertIncludes("Marketplace Turn Pricing", "Changelog should describe marketplace turn pricing.");
assertIncludes("Bonus Square Placement", "Changelog should describe bonus square placement.");
assertIncludes("center row or center column", "Changelog should mention center-line bonus exclusion.");
assertIncludes("Letter Point Rebalance", "Changelog should describe letter point rebalance.");
assertIncludes("1-to-5 scale", "Changelog should mention the new 1-to-5 letter scale.");

console.log("Changelog content checks passed.");
