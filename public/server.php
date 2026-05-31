<?php

declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$saveDirectory = realpath(__DIR__ . '/saved-games');

if ($saveDirectory === false) {
    $saveDirectory = __DIR__ . '/saved-games';
    mkdir($saveDirectory, 0775, true);
}

function send_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    print(json_encode($payload, JSON_PRETTY_PRINT));
    exit;
}

function game_path(string $saveDirectory, string $id): string
{
    if (!preg_match('/^[A-Z0-9]{5}$/', $id)) {
        send_json(['ok' => false, 'error' => 'Game ID must be a 5 character letter/number string.'], 400);
    }

    return $saveDirectory . DIRECTORY_SEPARATOR . $id . '.json';
}

function turn_index(array $state): int
{
    return max(0, (int) ($state['turnIndex'] ?? 0));
}

function state_timestamp(array $state, string $file): int
{
    $rawDate = (string) ($state['lastPlayDate'] ?? $state['startDate'] ?? '');
    $timestamp = $rawDate !== '' ? strtotime($rawDate) : false;

    return $timestamp === false ? (int) filemtime($file) : $timestamp;
}

function cleanup_saved_games(string $saveDirectory): int
{
    $now = time();
    $completedMaxAge = 31 * 24 * 60 * 60;
    $incompleteMaxAge = 62 * 24 * 60 * 60;
    $deletedCount = 0;

    foreach (glob($saveDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $file) {
        $state = json_decode((string) file_get_contents($file), true);

        if (!is_array($state)) {
            continue;
        }

        $age = $now - state_timestamp($state, $file);
        $maxAge = !empty($state['gameOver']) ? $completedMaxAge : $incompleteMaxAge;

        if ($age > $maxAge && is_file($file) && unlink($file)) {
            $deletedCount += 1;
        }
    }

    return $deletedCount;
}

$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$action = $_GET['action'] ?? $_POST['action'] ?? ($requestMethod === 'POST' ? 'save' : 'list');

if ($action === 'list') {
    $games = [];

    foreach (glob($saveDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $file) {
        $state = json_decode((string) file_get_contents($file), true);

        if (!is_array($state)) {
            continue;
        }

        $players = array_values(array_map(
            static fn(array $player): string => (string) ($player['name'] ?? 'Player'),
            array_filter($state['players'] ?? [], 'is_array')
        ));
        $currentPlayerIndex = (int) ($state['currentPlayerIndex'] ?? 0);

        $games[] = [
            'id' => (string) ($state['id'] ?? pathinfo($file, PATHINFO_FILENAME)),
            'startDate' => (string) ($state['startDate'] ?? ''),
            'lastPlayDate' => (string) ($state['lastPlayDate'] ?? ''),
            'gameOver' => !empty($state['gameOver']),
            'turnIndex' => turn_index($state),
            'playerNames' => $players,
            'currentPlayerName' => $players[$currentPlayerIndex] ?? ($players[0] ?? '')
        ];
    }

    send_json(['ok' => true, 'games' => $games]);
}

if ($action === 'load') {
    $id = strtoupper((string) ($_GET['id'] ?? ''));
    $file = game_path($saveDirectory, $id);

    if (!is_file($file)) {
        send_json(['ok' => false, 'error' => 'Game not found.'], 404);
    }

    $state = json_decode((string) file_get_contents($file), true);

    if (!is_array($state)) {
        send_json(['ok' => false, 'error' => 'Saved game is not valid JSON.'], 500);
    }

    $requestedTurnIndex = isset($_GET['turnIndex']) ? (int) $_GET['turnIndex'] : null;
    $savedTurnIndex = turn_index($state);

    if ($requestedTurnIndex !== null && $savedTurnIndex < $requestedTurnIndex) {
        send_json([
            'ok' => true,
            'changed' => false,
            'turnIndex' => $savedTurnIndex
        ]);
    }

    send_json(['ok' => true, 'gameState' => $state]);
}

if ($action === 'save') {
    if ($requestMethod !== 'POST') {
        send_json(['ok' => false, 'error' => 'Save requests must use POST.'], 405);
    }

    $rawBody = (string) file_get_contents('php://input');
    $state = json_decode($rawBody, true);

    if (!is_array($state) && isset($_POST['gameState'])) {
        $state = json_decode((string) $_POST['gameState'], true);
    }

    if (!is_array($state)) {
        send_json(['ok' => false, 'error' => 'Request body must be a game state JSON object.'], 400);
    }

    $id = strtoupper((string) ($state['id'] ?? ''));
    $file = game_path($saveDirectory, $id);
    $incomingTurnIndex = turn_index($state);
    $isNewGame = !is_file($file);

    if ($isNewGame) {
        cleanup_saved_games($saveDirectory);
    }

    if (!$isNewGame) {
        $currentState = json_decode((string) file_get_contents($file), true);

        if (!is_array($currentState)) {
            send_json(['ok' => false, 'error' => 'Current saved game is not valid JSON.'], 500);
        }

        $currentTurnIndex = turn_index($currentState);

        if ($incomingTurnIndex < $currentTurnIndex) {
            send_json([
                'ok' => true,
                'saved' => false,
                'stale' => true,
                'id' => $id,
                'turnIndex' => $currentTurnIndex,
                'error' => 'Save ignored because a newer turn is already stored.'
            ]);
        }
    }

    $state['lastPlayDate'] = gmdate('c');
    $encodedState = json_encode($state, JSON_PRETTY_PRINT);

    if ($encodedState === false || file_put_contents($file, $encodedState) === false) {
        send_json(['ok' => false, 'error' => 'Could not save game.'], 500);
    }

    send_json([
        'ok' => true,
        'saved' => true,
        'id' => $id,
        'turnIndex' => $incomingTurnIndex,
        'lastPlayDate' => $state['lastPlayDate']
    ]);
}

send_json(['ok' => false, 'error' => 'Unknown action.'], 400);
