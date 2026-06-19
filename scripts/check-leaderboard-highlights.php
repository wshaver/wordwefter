<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$saveDirectory = $root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'saved-games';
$leaderboardFile = $root . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'leaderboard.json';
$backupFile = $leaderboardFile . '.highlight-test-bak';
$fixtureFiles = [
    $saveDirectory . DIRECTORY_SEPARATOR . 'ZZHLA.json',
    $saveDirectory . DIRECTORY_SEPARATOR . 'ZZHLB.json'
];

function fail(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_same($expected, $actual, string $label): void
{
    if ($expected !== $actual) {
        fail($label . ' expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

function write_fixture(string $file, array $state): void
{
    $encoded = json_encode($state, JSON_PRETTY_PRINT);

    if ($encoded === false || file_put_contents($file, $encoded) === false) {
        fail('Could not write fixture ' . $file);
    }
}

function cleanup(array $fixtureFiles, string $leaderboardFile, string $backupFile): void
{
    foreach ($fixtureFiles as $file) {
        if (is_file($file)) {
            unlink($file);
        }
    }

    if (is_file($backupFile)) {
        rename($backupFile, $leaderboardFile);
    } elseif (is_file($leaderboardFile)) {
        unlink($leaderboardFile);
    }
}

if (!is_dir($saveDirectory)) {
    fail('Missing save directory ' . $saveDirectory);
}

if (is_file($backupFile)) {
    fail('Backup file already exists: ' . $backupFile);
}

if (is_file($leaderboardFile) && !rename($leaderboardFile, $backupFile)) {
    fail('Could not back up leaderboard file.');
}

register_shutdown_function(static function () use ($fixtureFiles, $leaderboardFile, $backupFile): void {
    cleanup($fixtureFiles, $leaderboardFile, $backupFile);
});

write_fixture($fixtureFiles[0], [
    'version' => 1,
    'id' => 'ZZHLA',
    'lastPlayDate' => '2026-06-01T10:00:00+00:00',
    'gameOver' => true,
    'players' => [
        ['name' => 'Ada', 'score' => 1234, 'authKey' => 'name:ada', 'provider' => 'name'],
        ['name' => 'Ben', 'score' => 100, 'authKey' => 'name:ben', 'provider' => 'name']
    ],
    'history' => [
        [
            'turnIndex' => 0,
            'playerName' => 'Ada',
            'words' => [
                ['word' => 'GOAT', 'score' => 8]
            ]
        ],
        [
            'turnIndex' => 1,
            'playerName' => 'Ada',
            'words' => [
                ['word' => 'QUIZZIFYING', 'score' => 777],
                ['word' => 'AX', 'score' => 22],
                ['word' => 'OX', 'score' => 18],
                ['word' => 'XI', 'score' => 15]
            ]
        ],
        [
            'turnIndex' => 2,
            'playerName' => 'Ada',
            'words' => [
                ['word' => 'FLOAT', 'score' => 18]
            ]
        ]
    ],
    'boardTiles' => [
        ['row' => 0, 'column' => 0, 'letter' => 'F'],
        ['row' => 0, 'column' => 1, 'letter' => 'L', 'stack' => [
            ['letter' => 'G'],
            ['letter' => 'L'],
            ['letter' => 'L'],
            ['letter' => 'L'],
            ['letter' => 'L'],
            ['letter' => 'L']
        ]],
        ['row' => 0, 'column' => 2, 'letter' => 'O'],
        ['row' => 0, 'column' => 3, 'letter' => 'A'],
        ['row' => 0, 'column' => 4, 'letter' => 'T']
    ]
]);

write_fixture($fixtureFiles[1], [
    'version' => 1,
    'id' => 'ZZHLB',
    'lastPlayDate' => '2026-06-20T12:00:00+00:00',
    'gameOver' => false,
    'players' => [
        ['name' => 'Cia', 'score' => 80, 'authKey' => 'name:cia', 'provider' => 'name']
    ],
    'history' => [
        [
            'turnIndex' => 0,
            'playerName' => 'Cia',
            'words' => [
                ['word' => 'HELLOWORLDX', 'score' => 1]
            ]
        ],
        [
            'turnIndex' => 1,
            'playerName' => 'Cia',
            'words' => [
                ['word' => 'RECENT', 'score' => 42],
                ['word' => 'ALL', 'score' => 8]
            ]
        ]
    ],
    'boardTiles' => [
        ['row' => 0, 'column' => 1, 'letter' => 'R']
    ]
]);

$runnerFile = tempnam(sys_get_temp_dir(), 'ww-leaderboard-');

if ($runnerFile === false) {
    fail('Could not create temporary PHP runner.');
}

$runnerScript = <<<PHP
<?php
chdir('{$root}');
\$_GET['action'] = 'leaderboard';
include '{$root}/public/server.php';
PHP;

if (file_put_contents($runnerFile, $runnerScript) === false) {
    fail('Could not write temporary PHP runner.');
}

$output = shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($runnerFile));
unlink($runnerFile);

if (!is_string($output) || trim($output) === '') {
    fail('No leaderboard response received.');
}

$payload = json_decode($output, true);

if (!is_array($payload) || empty($payload['ok'])) {
    fail('Leaderboard response was not successful: ' . $output);
}

$highlights = $payload['leaderboard']['highlights'] ?? null;

if (!is_array($highlights)) {
    fail('Leaderboard response did not include highlights.');
}

assert_same('RECENT', $highlights['recent']['word'] ?? null, 'recent word');
assert_same(50, $highlights['recent']['score'] ?? null, 'recent score');
assert_same(['RECENT', 'ALL'], $highlights['recent']['words'] ?? null, 'recent words');
assert_same('HELLOWORLDX', $highlights['longest']['word'] ?? null, 'longest word');
assert_same(6, $highlights['mostStacked']['stackDepth'] ?? null, 'most stacked depth');
assert_same(['GOAT', 'FLOAT'], $highlights['mostStacked']['words'] ?? null, 'most stacked words');
assert_same('QUIZZIFYING', $highlights['highestPoints']['word'] ?? null, 'highest points word');
assert_same(777, $highlights['highestPoints']['score'] ?? null, 'highest points score');
assert_same('Ada', $highlights['highestGameScore']['playerName'] ?? null, 'highest game score player');
assert_same(1234, $highlights['highestGameScore']['score'] ?? null, 'highest game score');
assert_same('ZZHLA', $highlights['highestGameScore']['gameId'] ?? null, 'highest game score game');
assert_same(4, $highlights['mostChangedWords']['wordCount'] ?? null, 'most changed words count');
assert_same(['QUIZZIFYING', 'AX', 'OX', 'XI'], $highlights['mostChangedWords']['words'] ?? null, 'most changed words');

echo 'Leaderboard highlight checks passed.' . PHP_EOL;
