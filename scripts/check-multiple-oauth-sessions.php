<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$serverSource = file_get_contents($root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'server.php');

if (!is_string($serverSource)) {
    fwrite(STDERR, "Could not read server.php.\n");
    exit(1);
}

$dispatcherOffset = strpos($serverSource, '$requestMethod =');

if ($dispatcherOffset === false) {
    fwrite(STDERR, "Could not locate server.php action dispatcher.\n");
    exit(1);
}

eval('?>' . substr($serverSource, 0, $dispatcherOffset));

function fail_check(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function assert_true(bool $actual, string $message): void
{
    if (!$actual) {
        fail_check($message);
    }
}

$tmpFile = tempnam(sys_get_temp_dir(), 'wordwefter-logins-');

if ($tmpFile === false) {
    fail_check('Could not create temporary login store.');
}

$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REQUEST_SCHEME'] = 'http';
$_SERVER['HTTPS'] = 'off';

try {
    $firstLogin = save_user_login($tmpFile, 'google', 'local-google-shared-account', 'Ada', '');
    $secondLogin = save_user_login($tmpFile, 'google', 'local-google-shared-account', 'Ada', '');

    assert_true(is_array($firstLogin), 'First login should be saved.');
    assert_true(is_array($secondLogin), 'Second login should be saved.');

    $firstToken = (string) ($firstLogin['sessionToken'] ?? '');
    $secondToken = (string) ($secondLogin['sessionToken'] ?? '');
    $storedLogin = get_user_login($tmpFile, 'google', 'local-google-shared-account');

    assert_true($firstToken !== '', 'First login should return a session token.');
    assert_true($secondToken !== '', 'Second login should return a session token.');
    assert_true($firstToken !== $secondToken, 'Each login should receive a distinct session token.');
    assert_true(is_array($storedLogin), 'Stored login should be readable after repeated logins.');
    assert_true(session_token_matches($storedLogin, $firstToken), 'First session token should remain valid after a second login.');
    assert_true(session_token_matches($storedLogin, $secondToken), 'Second session token should be valid.');

    echo "Multiple OAuth sessions remain valid.\n";
} finally {
    if (is_file($tmpFile)) {
        unlink($tmpFile);
    }
}
