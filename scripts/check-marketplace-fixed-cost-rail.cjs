const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const gameJs = fs.readFileSync(path.join(root, "src", "game.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");
const marketplaceRule = stylesCss.match(/\.marketplace\s*\{[\s\S]*?\n\}/)?.[0] || "";
const welcomeDemoGameAreaRule = stylesCss.match(/body\.screen-welcome\.welcome-demo \.game-area\s*\{[\s\S]*?\n\}/)?.[0] || "";

function assertIncludes(source, text, message) {
  if (!source.includes(text)) {
    console.error(message);
    process.exit(1);
  }
}

function assertNotIncludes(source, text, message) {
  if (source.includes(text)) {
    console.error(message);
    process.exit(1);
  }
}

function assertMatches(source, pattern, message) {
  if (!pattern.test(source)) {
    console.error(message);
    process.exit(1);
  }
}

assertIncludes(gameJs, "function createMarketplaceCostRail", "Marketplace costs should be rendered by a fixed frame rail.");
assertIncludes(gameJs, "function createMarketplaceFrameSlots", "Marketplace should reserve frame slots for non-open states.");
assertIncludes(gameJs, "marketplace.append(createMarketplaceCostRail())", "Marketplace cost rail should render before marketplace state branches.");
assertIncludes(gameJs, "marketplace.append(...createMarketplaceFrameSlots())", "Marketplace non-open states should reserve tile frame height.");
assertIncludes(stylesCss, ".marketplace-cost-rail", "Marketplace cost rail should have fixed frame styling.");
assertIncludes(stylesCss, "position: absolute", "Marketplace cost rail should be positioned independently of tiles.");
assertMatches(marketplaceRule, /(^|\n)\s*min-height: 4\.75rem;/, "Marketplace should keep the rack frame minimum height.");
assertIncludes(marketplaceRule, "padding: calc(clamp(0.45rem, 1.8vw, 0.75rem) + 0.42rem) clamp(0.45rem, 1.8vw, 0.75rem) clamp(0.45rem, 1.8vw, 0.75rem)", "Marketplace should match rack bottom padding.");
assertIncludes(stylesCss, ".marketplace-item-frame-placeholder", "Marketplace hidden frame slots should be styled.");
assertNotIncludes(gameJs, "itemElement.append(costElement)", "Marketplace costs should not be children of animated tile items.");
assertIncludes(welcomeDemoGameAreaRule, "gap: 1rem;", "Welcome example marketplace should use the same board gap as the in-game layout.");

console.log("Marketplace fixed cost rail checks passed.");
