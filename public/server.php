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

function tiles_remaining(array $state): ?int
{
    if (isset($state['tilesRemaining']) && is_numeric($state['tilesRemaining'])) {
        return max(0, (int) $state['tilesRemaining']);
    }

    if (!isset($state['lettersAvailable']) || !is_array($state['lettersAvailable'])) {
        return null;
    }

    $remaining = 0;

    foreach ($state['lettersAvailable'] as $count) {
        if (is_numeric($count)) {
            $remaining += max(0, (int) $count);
        }
    }

    return $remaining;
}

function state_timestamp(array $state, string $file): int
{
    $rawDate = (string) ($state['lastPlayDate'] ?? $state['startDate'] ?? '');
    $timestamp = $rawDate !== '' ? strtotime($rawDate) : false;

    return $timestamp === false ? (int) filemtime($file) : $timestamp;
}

function game_summary_timestamp(array $summary): int
{
    $rawDate = (string) ($summary['lastPlayDate'] ?? $summary['startDate'] ?? '');
    $timestamp = $rawDate !== '' ? strtotime($rawDate) : false;

    return $timestamp === false ? (int) ($summary['turnIndex'] ?? 0) : $timestamp;
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

function player_summaries(array $state): array
{
    return array_values(array_map(
        static fn(array $player): array => [
            'name' => (string) ($player['name'] ?? 'Player'),
            'score' => (int) ($player['score'] ?? 0),
            'invitedName' => (string) ($player['invitedName'] ?? ''),
            'authKey' => (string) ($player['authKey'] ?? ''),
            'provider' => (string) ($player['provider'] ?? ''),
            'claimed' => !isset($player['claimed']) || $player['claimed'] !== false,
            'open' => !empty($player['open']) || (isset($player['claimed']) && $player['claimed'] === false)
        ],
        array_filter($state['players'] ?? [], 'is_array')
    ));
}

function normalize_name_key(string $name): string
{
    return strtolower(trim($name));
}

function conceded_player_names(array $state): array
{
    $names = [];

    if (isset($state['concededByPlayerNames']) && is_array($state['concededByPlayerNames'])) {
        foreach ($state['concededByPlayerNames'] as $name) {
            $names[] = (string) $name;
        }
    }

    if (!empty($state['concededByPlayerName'])) {
        $names[] = (string) $state['concededByPlayerName'];
    }

    $seen = [];
    $normalizedNames = [];

    foreach ($names as $name) {
        $trimmedName = trim($name);
        $key = normalize_name_key($trimmedName);

        if ($trimmedName === '' || isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $normalizedNames[] = $trimmedName;
    }

    return $normalizedNames;
}

function current_player_name(array $players, array $concededNames, int $currentPlayerIndex, bool $gameOver): string
{
    if (count($players) === 0) {
        return '';
    }

    $safeIndex = max(0, min($currentPlayerIndex, count($players) - 1));

    if ($gameOver) {
        return $players[$safeIndex];
    }

    $concededKeys = array_fill_keys(array_map('normalize_name_key', $concededNames), true);

    if (empty($concededKeys[normalize_name_key($players[$safeIndex])])) {
        return $players[$safeIndex];
    }

    for ($offset = 1; $offset <= count($players); $offset += 1) {
        $candidateIndex = ($safeIndex + $offset) % count($players);

        if (empty($concededKeys[normalize_name_key($players[$candidateIndex])])) {
            return $players[$candidateIndex];
        }
    }

    return $players[$safeIndex];
}

function game_summary(array $state, string $file): array
{
    $playerSummaries = player_summaries($state);
    $players = array_values(array_map(
        static fn(array $player): string => $player['name'],
        $playerSummaries
    ));
    $currentPlayerIndex = (int) ($state['currentPlayerIndex'] ?? 0);
    $concededNames = conceded_player_names($state);
    $gameOver = !empty($state['gameOver']);

    return [
        'id' => (string) ($state['id'] ?? pathinfo($file, PATHINFO_FILENAME)),
        'startDate' => (string) ($state['startDate'] ?? ''),
        'lastPlayDate' => (string) ($state['lastPlayDate'] ?? ''),
        'gameOver' => $gameOver,
        'concededByPlayerName' => count($concededNames) > 0 ? $concededNames[count($concededNames) - 1] : '',
        'concededByPlayerNames' => $concededNames,
        'turnIndex' => turn_index($state),
        'tilesRemaining' => tiles_remaining($state),
        'playerNames' => $players,
        'players' => $playerSummaries,
        'currentPlayerName' => current_player_name($players, $concededNames, $currentPlayerIndex, $gameOver)
    ];
}

function waiting_games_for_player(string $saveDirectory, string $playerName, string $authKey, int $limit = 5): array
{
    $playerKey = normalize_name_key($playerName);
    $waitingGames = [];

    if ($playerKey === '' && $authKey === '') {
        return [];
    }

    foreach (glob($saveDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $file) {
        $state = json_decode((string) file_get_contents($file), true);

        if (!is_array($state) || !empty($state['gameOver'])) {
            continue;
        }

        $summary = game_summary($state, $file);
        $concededKeys = array_fill_keys(array_map('normalize_name_key', $summary['concededByPlayerNames'] ?? []), true);

        if (!empty($concededKeys[$playerKey])) {
            continue;
        }

        if (normalize_name_key((string) $summary['currentPlayerName']) !== $playerKey) {
            continue;
        }

        $isPlayer = array_reduce(
            $summary['players'],
            static fn(bool $carry, array $player): bool => $carry ||
                (
                    !empty($player['claimed']) &&
                    empty($player['open']) &&
                    (
                        normalize_name_key((string) $player['name']) === $playerKey ||
                        ($authKey !== '' && (string) $player['authKey'] === $authKey)
                    )
                ),
            false
        );

        if ($isPlayer) {
            $waitingGames[] = $summary;
        }
    }

    usort(
        $waitingGames,
        static fn(array $first, array $second): int =>
            game_summary_timestamp($second) <=> game_summary_timestamp($first)
    );

    return array_slice($waitingGames, 0, max(0, $limit));
}

function merge_identity_into_saved_games(
    string $saveDirectory,
    string $playerName,
    string $authKey,
    string $provider
): array {
    $playerKey = normalize_name_key($playerName);
    $authKey = trim($authKey);
    $provider = trim($provider);
    $updatedGames = [];

    if ($playerKey === '' || $authKey === '') {
        return $updatedGames;
    }

    foreach (glob($saveDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $file) {
        $state = json_decode((string) file_get_contents($file), true);

        if (!is_array($state) || !isset($state['players']) || !is_array($state['players'])) {
            continue;
        }

        $changed = false;

        foreach ($state['players'] as &$player) {
            if (!is_array($player)) {
                continue;
            }

            $existingAuthKey = trim((string) ($player['authKey'] ?? ''));
            $existingProvider = trim((string) ($player['provider'] ?? ''));
            $isOldStyleLogin =
                $existingAuthKey === '' ||
                $existingProvider === '' ||
                $existingProvider === 'name' ||
                substr($existingAuthKey, 0, 5) === 'name:';
            $isMatchingPlayer = normalize_name_key((string) ($player['name'] ?? '')) === $playerKey;
            $isClaimed = !isset($player['claimed']) || $player['claimed'] !== false;
            $isOpen = !empty($player['open']) || (isset($player['claimed']) && $player['claimed'] === false);

            if ($isMatchingPlayer && $isClaimed && !$isOpen && $isOldStyleLogin) {
                $player['authKey'] = $authKey;
                $player['provider'] = $provider;
                $changed = true;
            }
        }
        unset($player);

        if ($changed) {
            $encodedState = json_encode($state, JSON_PRETTY_PRINT);

            if ($encodedState !== false && file_put_contents($file, $encodedState) !== false) {
                $updatedGames[] = (string) ($state['id'] ?? pathinfo($file, PATHINFO_FILENAME));
            }
        }
    }

    return $updatedGames;
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

        $games[] = game_summary($state, $file);
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

    $waitingGames = waiting_games_for_player(
        $saveDirectory,
        (string) ($_GET['playerName'] ?? ''),
        (string) ($_GET['authKey'] ?? ''),
        5
    );

    if ($requestedTurnIndex !== null && $savedTurnIndex < $requestedTurnIndex) {
        send_json([
            'ok' => true,
            'changed' => false,
            'turnIndex' => $savedTurnIndex,
            'waitingGames' => $waitingGames
        ]);
    }

    send_json(['ok' => true, 'gameState' => $state, 'waitingGames' => $waitingGames]);
}

if ($action === 'merge_identity') {
    if ($requestMethod !== 'POST') {
        send_json(['ok' => false, 'error' => 'Merge requests must use POST.'], 405);
    }

    $rawBody = (string) file_get_contents('php://input');
    $payload = json_decode($rawBody, true);

    if (!is_array($payload)) {
        send_json(['ok' => false, 'error' => 'Request body must be a JSON object.'], 400);
    }

    $updatedGames = merge_identity_into_saved_games(
        $saveDirectory,
        (string) ($payload['playerName'] ?? ''),
        (string) ($payload['authKey'] ?? ''),
        (string) ($payload['provider'] ?? '')
    );

    send_json([
        'ok' => true,
        'merged' => count($updatedGames),
        'games' => $updatedGames
    ]);
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
