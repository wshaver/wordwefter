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
assert(
  /function handleMissingStoredIdentity\(options = \{\}\)/.test(source),
  'Missing stored identity handling should be centralized for cross-tab logout detection.'
);
const missingIdentityMatch = source.match(/function handleMissingStoredIdentity\(options = \{\}\) \{([\s\S]*?)\n\}/);
assert(
  missingIdentityMatch && missingIdentityMatch[1].includes('setScreen("welcome")'),
  'Missing stored identity handling should redirect to the login/welcome route.'
);
assert(
  /if \(!storedPlayerName\) \{\s*activeGamesList\.textContent = "";\s*setWaitingGamesForMenu\(\[\]\);\s*if \(document\.body\.classList\.contains\("screen-list"\)\) \{\s*handleMissingStoredIdentity\(\{ message: "Please login again to continue" \}\);\s*\}\s*return;\s*\}/.test(source),
  'The game list should redirect to login when another tab removes the stored identity.'
);
assert(
  /window\.addEventListener\("storage", handleIdentityStorageChange\);/.test(source),
  'Cross-tab identity storage changes should be observed immediately.'
);
