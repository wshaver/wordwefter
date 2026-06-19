const fs = require('fs');
const source = fs.readFileSync('public/game.js', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const invalidLoginMatch = source.match(/function handleInvalidLogin\(error\) \{([\s\S]*?)\n\}/);
assert(invalidLoginMatch, 'handleInvalidLogin() should exist.');
assert(
  invalidLoginMatch[1].includes('Please login again to continue'),
  'Invalid login handling should show the user-facing re-login message.'
);
assert(
  invalidLoginMatch[1].includes('setScreen("welcome"'),
  'Invalid login handling should redirect to the login/welcome screen without a page refresh.'
);
assert(
  /function isAuthInvalidError\(error\)/.test(source),
  'Auth invalid detection should be centralized so list-route load failures can redirect consistently.'
);
assert(
  /if \(isAuthInvalidError\(error\)\) \{\s*activeGamesList\.textContent = "";\s*handleInvalidLogin\(error\);\s*return;\s*\}/.test(source),
  'The active-games list should clear stale list content and redirect on auth-invalid list failures.'
);
assert(
  /catch \(error\) \{\s*if \(isAuthInvalidError\(error\)\) \{\s*return false;\s*\}/.test(source),
  'URL hash load failures caused by invalid auth should not be overwritten by a generic could-not-load message.'
);
