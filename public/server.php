<?php

declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$saveDirectory = realpath(__DIR__ . '/saved-games');
$userLoginFile = __DIR__ . '/../server-data/user-logins.json';
$oauthConfigFile = __DIR__ . '/../server-data/oauth-config.json';
$leaderboardFile = __DIR__ . '/../data/leaderboard.json';

if ($saveDirectory === false) {
    $saveDirectory = __DIR__ . '/saved-games';
    mkdir($saveDirectory, 0775, true);
}

$userLoginDirectory = dirname($userLoginFile);

if (!is_dir($userLoginDirectory)) {
    mkdir($userLoginDirectory, 0775, true);
}

function send_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    print(json_encode($payload, JSON_PRETTY_PRINT));
    exit;
}

function env_value(string $key): string
{
    $value = getenv($key);

    return is_string($value) ? trim($value) : '';
}

function public_oauth_provider_config(array $config, string $envPrefix): array
{
    $clientId = trim((string) ($config['clientId'] ?? env_value($envPrefix . '_CLIENT_ID')));
    $scope = trim((string) ($config['scope'] ?? env_value($envPrefix . '_SCOPE')));
    $publicConfig = [];

    if ($clientId !== '') {
        $publicConfig['clientId'] = $clientId;
    }

    if ($scope !== '') {
        $publicConfig['scope'] = $scope;
    }

    return $publicConfig;
}

function public_oauth_config_object(array $config): object
{
    return (object) $config;
}

function read_public_oauth_config(string $oauthConfigFile): array
{
    $fileConfig = [];

    if (is_file($oauthConfigFile)) {
        $decodedConfig = json_decode((string) file_get_contents($oauthConfigFile), true);

        if (is_array($decodedConfig)) {
            $fileConfig = $decodedConfig;
        }
    }

    return [
        'google' => public_oauth_config_object(public_oauth_provider_config(
            is_array($fileConfig['google'] ?? null) ? $fileConfig['google'] : [],
            'WORDWEFTER_GOOGLE'
        )),
        'facebook' => public_oauth_config_object(public_oauth_provider_config(
            is_array($fileConfig['facebook'] ?? null) ? $fileConfig['facebook'] : [],
            'WORDWEFTER_FACEBOOK'
        ))
    ];
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

function is_unplayed_conceded_game(array $state): bool
{
    if (empty($state['gameOver'])) {
        return false;
    }

    $concededNames = [];

    if (isset($state['concededByPlayerNames']) && is_array($state['concededByPlayerNames'])) {
        $concededNames = array_filter(array_map('trim', array_map('strval', $state['concededByPlayerNames'])));
    }

    if (!empty($state['concededByPlayerName'])) {
        $concededNames[] = trim((string) $state['concededByPlayerName']);
    }

    if (count(array_filter($concededNames)) === 0) {
        return false;
    }

    $history = is_array($state['history'] ?? null) ? $state['history'] : [];

    if (count($history) > 1) {
        return false;
    }

    if (count($history) === 1) {
        $entry = $history[0];

        if (!is_array($entry) || (string) ($entry['action'] ?? '') !== 'concede') {
            return false;
        }
    }

    return turn_index($state) <= 1;
}

function cleanup_saved_games(string $saveDirectory, string $leaderboardFile): int
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

        if (is_unplayed_conceded_game($state)) {
            if (is_file($file) && unlink($file)) {
                $deletedCount += 1;
            }

            continue;
        }

        $age = $now - state_timestamp($state, $file);
        $maxAge = !empty($state['gameOver']) ? $completedMaxAge : $incompleteMaxAge;

        if ($age <= $maxAge || !is_file($file)) {
            continue;
        }

        if (archive_leaderboard_game($leaderboardFile, $state, $file) && unlink($file)) {
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

function leaderboard_player_key(array $player): string
{
    $name = trim((string) ($player['name'] ?? ''));
    $nameKey = normalize_name_key($name);
    $authKey = normalize_auth_key((string) ($player['authKey'] ?? ''));

    if ($authKey !== '' && !is_legacy_name_auth_key($authKey)) {
        return 'auth:' . $authKey;
    }

    return $nameKey !== '' ? 'name:' . $nameKey : '';
}

function normalize_provider(string $provider): string
{
    $normalizedProvider = strtolower(trim($provider));

    return in_array($normalizedProvider, ['google', 'facebook'], true) ? $normalizedProvider : '';
}

function normalize_provider_user_id(string $userId): string
{
    $normalizedUserId = trim($userId);

    if ($normalizedUserId === '' || strtolower($normalizedUserId) === 'null') {
        return '';
    }

    return $normalizedUserId;
}

function request_host(): string
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));

    return preg_replace('/:\d+$/', '', $host) ?? $host;
}

function request_allows_legacy_name_login(): bool
{
    return preg_match('/(^|\.)willshaver\.com$/i', request_host()) === 1 ||
        request_is_local_wordwefter_http();
}

function request_enforces_strict_auth(): bool
{
    return preg_match('/(^|\.)wordwefter\.com$/i', request_host()) === 1;
}

function request_disables_new_games(): bool
{
    return preg_match('/(^|\.)willshaver\.com$/i', request_host()) === 1;
}

function request_is_local_http(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $scheme = strtolower((string) ($_SERVER['REQUEST_SCHEME'] ?? ''));
    $forwardedProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    $host = request_host();
    $isHttps = $https === 'on' || $https === '1' || $scheme === 'https' || $forwardedProto === 'https';
    $isLocalHost = preg_match('/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1)$/i', $host) === 1;

    return !$isHttps && $isLocalHost;
}

function request_is_local_wordwefter_http(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $scheme = strtolower((string) ($_SERVER['REQUEST_SCHEME'] ?? ''));
    $forwardedProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    $isHttps = $https === 'on' || $https === '1' || $scheme === 'https' || $forwardedProto === 'https';

    return !$isHttps && request_host() === 'wordwefter';
}

function is_local_fallback_user_id(string $userId): bool
{
    return strncmp($userId, 'local-', 6) === 0;
}

function user_login_key(string $provider, string $userId): string
{
    $normalizedProvider = normalize_provider($provider);
    $normalizedUserId = normalize_provider_user_id($userId);

    return $normalizedProvider !== '' && $normalizedUserId !== ''
        ? $normalizedProvider . ':' . $normalizedUserId
        : '';
}

function normalize_auth_key(string $authKey): string
{
    $parts = explode(':', trim($authKey), 2);

    if (count($parts) !== 2) {
        return '';
    }

    if (strtolower(trim($parts[0])) === 'name') {
        $nameKey = normalize_name_key($parts[1]);

        return request_allows_legacy_name_login() && $nameKey !== ''
            ? 'name:' . $nameKey
            : '';
    }

    return user_login_key($parts[0], $parts[1]);
}

function is_legacy_name_auth_key(string $authKey): bool
{
    return strncmp($authKey, 'name:', 5) === 0;
}

function validate_request_auth(string $userLoginFile, string $authKey, string $sessionToken, string $actionLabel): array
{
    $requestAuthKey = normalize_auth_key($authKey);
    $isLegacyNameLogin = is_legacy_name_auth_key($requestAuthKey);
    $registeredLogin = get_user_login_by_auth_key($userLoginFile, $requestAuthKey);
    $strictAuth = request_enforces_strict_auth();

    if ($strictAuth) {
        if ($requestAuthKey === '' || (!$isLegacyNameLogin && $registeredLogin === null)) {
            send_json(['ok' => false, 'authInvalid' => true, 'error' => $actionLabel . ' rejected because this login token is not registered on the server.'], 403);
        }

        if (!$isLegacyNameLogin && is_local_fallback_user_id((string) ($registeredLogin['userId'] ?? '')) && !request_is_local_http()) {
            send_json(['ok' => false, 'authInvalid' => true, 'error' => $actionLabel . ' rejected because local fallback logins are only allowed on the local HTTP server.'], 403);
        }

        if (!$isLegacyNameLogin && !session_token_matches($registeredLogin, trim($sessionToken))) {
            send_json(['ok' => false, 'authInvalid' => true, 'error' => $actionLabel . ' rejected because this login session is not valid.'], 403);
        }
    }

    return [
        'authKey' => $requestAuthKey,
        'isLegacyNameLogin' => $isLegacyNameLogin,
        'registeredLogin' => $registeredLogin,
        'strictAuth' => $strictAuth
    ];
}

function request_has_auth_credentials(string $authKey, string $sessionToken): bool
{
    return trim($authKey) !== '' || trim($sessionToken) !== '';
}

function read_user_logins(string $userLoginFile): array
{
    if (!is_file($userLoginFile)) {
        return [];
    }

    $logins = json_decode((string) file_get_contents($userLoginFile), true);

    return is_array($logins) ? $logins : [];
}

function create_session_token(): string
{
    return bin2hex(random_bytes(32));
}

function hash_session_token(string $sessionToken): string
{
    return hash('sha256', $sessionToken);
}

function login_session_token_hashes(?array $entry): array
{
    return array_values(array_unique(array_map(
        static fn(array $session): string => $session['hash'],
        login_session_token_records($entry)
    )));
}

function login_session_token_records(?array $entry): array
{
    $sessions = is_array($entry) && is_array($entry['sessionTokens'] ?? null)
        ? $entry['sessionTokens']
        : [];
    $recordsByHash = [];

    foreach ($sessions as $session) {
        if (is_array($session)) {
            $sessionHash = (string) ($session['hash'] ?? '');
            $issuedAt = (string) ($session['issuedAt'] ?? '');
        } else {
            $sessionHash = (string) $session;
            $issuedAt = '';
        }

        if ($sessionHash !== '') {
            $recordsByHash[$sessionHash] = [
                'hash' => $sessionHash,
                'issuedAt' => $issuedAt
            ];
        }
    }

    $legacyHash = is_array($entry) ? (string) ($entry['sessionTokenHash'] ?? '') : '';

    if ($legacyHash !== '' && !isset($recordsByHash[$legacyHash])) {
        $recordsByHash[$legacyHash] = [
            'hash' => $legacyHash,
            'issuedAt' => (string) ($entry['sessionIssuedAt'] ?? '')
        ];
    }

    return array_values($recordsByHash);
}

function session_token_matches(?array $entry, string $sessionToken): bool
{
    if ($sessionToken === '') {
        return false;
    }

    $requestHash = hash_session_token($sessionToken);

    foreach (login_session_token_hashes($entry) as $sessionHash) {
        if (hash_equals($sessionHash, $requestHash)) {
            return true;
        }
    }

    return false;
}

function write_user_logins(string $userLoginFile, array $logins): bool
{
    $encodedLogins = json_encode($logins, JSON_PRETTY_PRINT);

    return $encodedLogins !== false && file_put_contents($userLoginFile, $encodedLogins, LOCK_EX) !== false;
}

function get_user_login(string $userLoginFile, string $provider, string $userId): ?array
{
    $key = user_login_key($provider, $userId);

    if ($key === '') {
        return null;
    }

    $logins = read_user_logins($userLoginFile);
    $entry = $logins[$key] ?? null;

    return is_array($entry) ? $entry : null;
}

function get_user_login_by_auth_key(string $userLoginFile, string $authKey): ?array
{
    $key = normalize_auth_key($authKey);

    if ($key === '') {
        return null;
    }

    $logins = read_user_logins($userLoginFile);
    $entry = $logins[$key] ?? null;

    return is_array($entry) ? $entry : null;
}

function fetch_json_url(string $url, array $headers = []): ?array
{
    $headerLines = array_merge(['Accept: application/json'], $headers);
    $context = stream_context_create([
        'http' => [
            'header' => implode("\r\n", $headerLines),
            'ignore_errors' => true,
            'timeout' => 8
        ]
    ]);
    $rawBody = @file_get_contents($url, false, $context);

    if ($rawBody === false) {
        return null;
    }

    $payload = json_decode((string) $rawBody, true);

    return is_array($payload) ? $payload : null;
}

function validate_provider_access_token(string $provider, string $userId, string $accessToken): bool
{
    if ($accessToken === '') {
        return false;
    }

    if ($provider === 'google') {
        $payload = fetch_json_url(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            ['Authorization: Bearer ' . $accessToken]
        );

        return is_array($payload) && hash_equals($userId, (string) ($payload['sub'] ?? ''));
    }

    if ($provider === 'facebook') {
        $payload = fetch_json_url(
            'https://graph.facebook.com/me?fields=id&access_token=' . rawurlencode($accessToken)
        );

        return is_array($payload) && hash_equals($userId, (string) ($payload['id'] ?? ''));
    }

    return false;
}

function user_login_can_be_saved(string $provider, string $userId, string $accessToken): bool
{
    if (is_local_fallback_user_id($userId)) {
        return request_is_local_http();
    }

    return validate_provider_access_token($provider, $userId, $accessToken);
}

function public_user_login_entry(array $entry, string $sessionToken = ''): array
{
    $publicEntry = [
        'provider' => (string) ($entry['provider'] ?? ''),
        'userId' => (string) ($entry['userId'] ?? ''),
        'username' => (string) ($entry['username'] ?? ''),
        'updatedAt' => (string) ($entry['updatedAt'] ?? '')
    ];

    if ($sessionToken !== '') {
        $publicEntry['sessionToken'] = $sessionToken;
    }

    return $publicEntry;
}

function save_user_login(string $userLoginFile, string $provider, string $userId, string $playerName, string $accessToken): ?array
{
    $normalizedProvider = normalize_provider($provider);
    $normalizedUserId = normalize_provider_user_id($userId);
    $normalizedPlayerName = trim($playerName);
    $key = user_login_key($normalizedProvider, $normalizedUserId);

    if ($key === '' || $normalizedPlayerName === '' || !user_login_can_be_saved($normalizedProvider, $normalizedUserId, $accessToken)) {
        return null;
    }

    $logins = read_user_logins($userLoginFile);
    $existingEntry = isset($logins[$key]) && is_array($logins[$key])
        ? $logins[$key]
        : null;
    $sessionToken = create_session_token();
    $sessionHash = hash_session_token($sessionToken);
    $sessionIssuedAt = gmdate('c');
    $existingSessionTokens = login_session_token_records($existingEntry);
    $sessionTokensByHash = [];

    foreach ($existingSessionTokens as $session) {
        $sessionTokensByHash[(string) $session['hash']] = $session;
    }

    $sessionTokensByHash[$sessionHash] = [
        'hash' => $sessionHash,
        'issuedAt' => $sessionIssuedAt
    ];

    $sessionTokens = array_values($sessionTokensByHash);
    $sessionTokens = array_slice($sessionTokens, -20);
    $entry = [
        'provider' => $normalizedProvider,
        'userId' => $normalizedUserId,
        'username' => $normalizedPlayerName,
        'sessionTokenHash' => $sessionHash,
        'sessionTokens' => $sessionTokens,
        'sessionIssuedAt' => $sessionIssuedAt,
        'updatedAt' => $sessionIssuedAt
    ];
    $logins[$key] = $entry;

    return write_user_logins($userLoginFile, $logins)
        ? public_user_login_entry($entry, $sessionToken)
        : null;
}

function player_auth_key(array $player): string
{
    return normalize_auth_key((string) ($player['authKey'] ?? ''));
}

function player_is_claimed(array $player): bool
{
    return (!isset($player['claimed']) || $player['claimed'] !== false) && empty($player['open']);
}

function player_is_open_slot(array $player): bool
{
    return !empty($player['open']) ||
        (isset($player['claimed']) && $player['claimed'] === false) ||
        preg_match('/^open spot \d+$/i', (string) ($player['name'] ?? '')) === 1;
}

function player_has_auth_key(array $player, string $authKey): bool
{
    return $authKey !== '' && player_auth_key($player) === $authKey;
}

function state_has_claimed_player_with_auth_key(array $state, string $authKey): bool
{
    foreach (($state['players'] ?? []) as $player) {
        if (is_array($player) && player_is_claimed($player) && player_has_auth_key($player, $authKey)) {
            return true;
        }
    }

    return false;
}

function state_preserves_existing_claimed_auth_keys(array $currentState, array $incomingState): bool
{
    $currentPlayers = array_values(array_filter($currentState['players'] ?? [], 'is_array'));
    $incomingPlayers = array_values(array_filter($incomingState['players'] ?? [], 'is_array'));

    foreach ($currentPlayers as $index => $currentPlayer) {
        if (!player_is_claimed($currentPlayer)) {
            continue;
        }

        $currentAuthKey = player_auth_key($currentPlayer);

        if ($currentAuthKey === '') {
            continue;
        }

        $incomingPlayer = $incomingPlayers[$index] ?? null;

        if (!is_array($incomingPlayer) || !player_is_claimed($incomingPlayer) || player_auth_key($incomingPlayer) !== $currentAuthKey) {
            return false;
        }
    }

    return true;
}

function merge_existing_claimed_players_into_incoming(array $currentState, array &$incomingState, string $requestAuthKey): bool
{
    $currentPlayers = array_values(array_filter($currentState['players'] ?? [], 'is_array'));
    $incomingPlayers = array_values(array_filter($incomingState['players'] ?? [], 'is_array'));
    $changed = false;

    foreach ($currentPlayers as $index => $currentPlayer) {
        if (!player_is_claimed($currentPlayer)) {
            continue;
        }

        $currentAuthKey = player_auth_key($currentPlayer);

        if ($currentAuthKey === '' || $currentAuthKey === $requestAuthKey) {
            continue;
        }

        $incomingPlayer = $incomingPlayers[$index] ?? null;

        if (is_array($incomingPlayer) && player_is_claimed($incomingPlayer) && player_auth_key($incomingPlayer) === $currentAuthKey) {
            continue;
        }

        $incomingPlayers[$index] = $currentPlayer;
        $changed = true;
    }

    if ($changed) {
        $incomingState['players'] = $incomingPlayers;
    }

    return $changed;
}

function state_is_valid_new_player_claim(array $currentState, array $incomingState, string $authKey): bool
{
    $currentPlayers = array_values(array_filter($currentState['players'] ?? [], 'is_array'));
    $incomingPlayers = array_values(array_filter($incomingState['players'] ?? [], 'is_array'));
    $claimCount = 0;

    foreach ($currentPlayers as $index => $currentPlayer) {
        $incomingPlayer = $incomingPlayers[$index] ?? null;

        if (!is_array($incomingPlayer)) {
            continue;
        }

        if (player_is_open_slot($currentPlayer) && player_is_claimed($incomingPlayer) && player_has_auth_key($incomingPlayer, $authKey)) {
            $claimCount += 1;
        }
    }

    return $claimCount === 1;
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

function empty_archived_leaderboard_stats(): array
{
    return [
        'totalGamesPlayed' => 0,
        'archivedGameIds' => [],
        'players' => [],
        'highlights' => empty_leaderboard_highlights()
    ];
}

function empty_leaderboard_highlights(): array
{
    return [
        'recent' => null,
        'longest' => null,
        'mostStacked' => null,
        'highestPoints' => null,
        'highestGameScore' => null,
        'mostWords' => null
    ];
}

function normalize_leaderboard_highlight(?array $highlight, string $type): ?array
{
    if (!is_array($highlight)) {
        return null;
    }

    $gameId = strtoupper(trim((string) ($highlight['gameId'] ?? '')));
    $playerName = trim((string) ($highlight['playerName'] ?? ''));
    $timestamp = (int) ($highlight['timestamp'] ?? 0);
    $turnIndex = max(0, (int) ($highlight['turnIndex'] ?? 0));

    if ($gameId === '' && $playerName === '') {
        return null;
    }

    $normalized = [
        'gameId' => $gameId,
        'playerName' => $playerName,
        'timestamp' => $timestamp,
        'turnIndex' => $turnIndex
    ];

    if (isset($highlight['word'])) {
        $word = strtoupper(trim((string) $highlight['word']));

        if ($word !== '') {
            $normalized['word'] = $word;
            $normalized['score'] = max(0, (int) ($highlight['score'] ?? 0));
            $normalized['wordLength'] = strlen($word);
        }
    }

    if ($type === 'mostStacked') {
        $stackDepth = max(0, (int) ($highlight['stackDepth'] ?? 0));

        if ($stackDepth <= 1) {
            return null;
        }

        $normalized['stackDepth'] = $stackDepth;
        $normalized['row'] = max(0, (int) ($highlight['row'] ?? 0));
        $normalized['column'] = max(0, (int) ($highlight['column'] ?? 0));
        $normalized['letter'] = strtoupper(trim((string) ($highlight['letter'] ?? '')));
        $normalized['words'] = normalize_highlight_words($highlight['words'] ?? []);
    }

    if ($type === 'mostWords') {
        $wordCount = max(0, (int) ($highlight['wordCount'] ?? 0));

        if ($wordCount <= 0) {
            return null;
        }

        $words = normalize_highlight_words($highlight['words'] ?? []);

        $normalized['wordCount'] = $wordCount;
        $normalized['letterCount'] = leaderboard_word_letter_count($words);
        $normalized['score'] = max(0, (int) ($highlight['score'] ?? 0));
        $normalized['words'] = $words;
    }

    if ($type === 'recent') {
        $words = normalize_highlight_words($highlight['words'] ?? []);

        if (count($words) > 0) {
            $normalized['words'] = $words;
            $normalized['wordCount'] = count($words);
        }
    }

    if ($type === 'highestGameScore') {
        $score = max(0, (int) ($highlight['score'] ?? 0));

        if ($score <= 0) {
            return null;
        }

        $normalized['score'] = $score;
    }

    return $normalized;
}

function normalize_highlight_words($words): array
{
    $normalized = [];

    foreach ((is_array($words) ? $words : []) as $word) {
        $word = strtoupper(trim((string) $word));

        if ($word !== '') {
            $normalized[] = $word;
        }
    }

    return array_values(array_unique($normalized));
}

function leaderboard_word_letter_count($words): int
{
    return array_reduce(
        normalize_highlight_words($words),
        static fn(int $total, string $word): int => $total + strlen($word),
        0
    );
}

function normalize_leaderboard_highlights($highlights): array
{
    $normalized = empty_leaderboard_highlights();

    if (!is_array($highlights)) {
        return $normalized;
    }

    foreach (array_keys($normalized) as $type) {
        $normalized[$type] = normalize_leaderboard_highlight(
            is_array($highlights[$type] ?? null) ? $highlights[$type] : null,
            $type
        );
    }

    return $normalized;
}

function leaderboard_highlight_is_better(?array $candidate, ?array $current, string $type): bool
{
    if ($candidate === null) {
        return false;
    }

    if ($current === null) {
        return true;
    }

    return match ($type) {
        'recent' => [
            (int) ($candidate['timestamp'] ?? 0),
            (int) ($candidate['turnIndex'] ?? 0),
            (string) ($candidate['gameId'] ?? '')
        ] > [
            (int) ($current['timestamp'] ?? 0),
            (int) ($current['turnIndex'] ?? 0),
            (string) ($current['gameId'] ?? '')
        ],
        'longest' => [
            (int) ($candidate['wordLength'] ?? 0),
            (int) ($candidate['timestamp'] ?? 0),
            (int) ($candidate['turnIndex'] ?? 0),
            (int) ($candidate['score'] ?? 0)
        ] > [
            (int) ($current['wordLength'] ?? 0),
            (int) ($current['timestamp'] ?? 0),
            (int) ($current['turnIndex'] ?? 0),
            (int) ($current['score'] ?? 0)
        ],
        'mostStacked' => [
            (int) ($candidate['stackDepth'] ?? 0),
            (int) ($candidate['timestamp'] ?? 0)
        ] > [
            (int) ($current['stackDepth'] ?? 0),
            (int) ($current['timestamp'] ?? 0)
        ],
        'highestPoints' => [
            (int) ($candidate['score'] ?? 0),
            (int) ($candidate['wordLength'] ?? 0),
            (int) ($candidate['timestamp'] ?? 0)
        ] > [
            (int) ($current['score'] ?? 0),
            (int) ($current['wordLength'] ?? 0),
            (int) ($current['timestamp'] ?? 0)
        ],
        'highestGameScore' => [
            (int) ($candidate['score'] ?? 0),
            (int) ($candidate['timestamp'] ?? 0),
            (string) ($candidate['gameId'] ?? '')
        ] > [
            (int) ($current['score'] ?? 0),
            (int) ($current['timestamp'] ?? 0),
            (string) ($current['gameId'] ?? '')
        ],
        'mostWords' => [
            (int) ($candidate['wordCount'] ?? 0),
            (int) ($candidate['letterCount'] ?? 0),
            (int) ($candidate['timestamp'] ?? 0)
        ] > [
            (int) ($current['wordCount'] ?? 0),
            (int) ($current['letterCount'] ?? 0),
            (int) ($current['timestamp'] ?? 0)
        ],
        default => false
    };
}

function merge_leaderboard_highlight(array $highlights, string $type, ?array $candidate): array
{
    $candidate = normalize_leaderboard_highlight($candidate, $type);

    if (leaderboard_highlight_is_better($candidate, $highlights[$type] ?? null, $type)) {
        $highlights[$type] = $candidate;
    }

    return $highlights;
}

function merge_leaderboard_highlights(array $first, array $second): array
{
    $merged = normalize_leaderboard_highlights($first);
    $second = normalize_leaderboard_highlights($second);

    foreach (array_keys($merged) as $type) {
        $merged = merge_leaderboard_highlight($merged, $type, $second[$type]);
    }

    return $merged;
}

function board_tile_letter_at_stack_layer(array $tile, int $layer): string
{
    $stack = is_array($tile['stack'] ?? null) ? $tile['stack'] : [];

    if (count($stack) > 0) {
        $index = min(max(0, $layer - 1), count($stack) - 1);
        $stackTile = is_array($stack[$index] ?? null) ? $stack[$index] : [];

        return strtoupper(trim((string) ($stackTile['letter'] ?? $tile['letter'] ?? '')));
    }

    return strtoupper(trim((string) ($tile['letter'] ?? '')));
}

function board_word_at_stack_layer(array $tileMap, int $row, int $column, int $layer, string $axis): string
{
    $rowStep = $axis === 'row' ? 0 : 1;
    $columnStep = $axis === 'row' ? 1 : 0;
    $startRow = $row;
    $startColumn = $column;

    while (isset($tileMap[($startRow - $rowStep) . ',' . ($startColumn - $columnStep)])) {
        $startRow -= $rowStep;
        $startColumn -= $columnStep;
    }

    $letters = [];
    $currentRow = $startRow;
    $currentColumn = $startColumn;

    while (isset($tileMap[$currentRow . ',' . $currentColumn])) {
        $letter = board_tile_letter_at_stack_layer($tileMap[$currentRow . ',' . $currentColumn], $layer);

        if ($letter === '') {
            break;
        }

        $letters[] = $letter;
        $currentRow += $rowStep;
        $currentColumn += $columnStep;
    }

    return count($letters) > 1 ? implode('', $letters) : '';
}

function history_word_strings(array $state): array
{
    $words = [];

    foreach ((is_array($state['history'] ?? null) ? $state['history'] : []) as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        foreach ((is_array($entry['words'] ?? null) ? $entry['words'] : []) as $wordScore) {
            if (!is_array($wordScore)) {
                continue;
            }

            $word = strtoupper(trim((string) ($wordScore['word'] ?? '')));

            if ($word !== '') {
                $words[] = $word;
            }
        }
    }

    return array_values(array_unique($words));
}

function filter_stacked_words_to_history(array $historyWords, array $layerWords): array
{
    $historyLookup = array_fill_keys($historyWords, true);
    $words = [];

    foreach ($layerWords as $word) {
        $word = strtoupper(trim((string) $word));

        if ($word === '') {
            continue;
        }

        if (isset($historyLookup[$word])) {
            $words[] = $word;
            continue;
        }

        foreach ($historyWords as $historyWord) {
            if (
                $historyWord !== '' &&
                strlen($historyWord) > 1 &&
                strlen($historyWord) < strlen($word) &&
                strpos($word, $historyWord) !== false
            ) {
                $words[] = $historyWord;
            }
        }
    }

    return array_values(array_unique($words));
}

function stacked_words_for_board_tile(array $state, array $targetTile, int $stackDepth): array
{
    $tileMap = [];

    foreach ((is_array($state['boardTiles'] ?? null) ? $state['boardTiles'] : []) as $tile) {
        if (!is_array($tile)) {
            continue;
        }

        $row = (int) ($tile['row'] ?? -1);
        $column = (int) ($tile['column'] ?? -1);

        if ($row < 0 || $column < 0) {
            continue;
        }

        $tileMap[$row . ',' . $column] = $tile;
    }

    $row = (int) ($targetTile['row'] ?? -1);
    $column = (int) ($targetTile['column'] ?? -1);
    $words = [];
    $historyWords = history_word_strings($state);

    if ($row < 0 || $column < 0) {
        return $words;
    }

    $axisWords = [
        'row' => [],
        'column' => []
    ];

    for ($layer = 1; $layer <= $stackDepth; $layer += 1) {
        foreach (array_keys($axisWords) as $axis) {
            $layerWords = array_values(array_filter([
                board_word_at_stack_layer($tileMap, $row, $column, $layer, $axis)
            ]));

            if (count($layerWords) > 0) {
                array_push($axisWords[$axis], ...filter_stacked_words_to_history($historyWords, $layerWords));
            }
        }
    }

    foreach ($axisWords as $axis => $axisWordList) {
        $axisWords[$axis] = array_values(array_unique($axisWordList));
    }

    usort(
        $axisWords,
        static fn(array $first, array $second): int => [
            count($second),
            leaderboard_word_letter_count($second)
        ] <=> [
            count($first),
            leaderboard_word_letter_count($first)
        ]
    );

    return $axisWords[0] ?? [];
}

function leaderboard_highlights_for_game(array $state, string $file): array
{
    $highlights = empty_leaderboard_highlights();
    $gameId = strtoupper((string) ($state['id'] ?? pathinfo($file, PATHINFO_FILENAME)));
    $rawDate = (string) ($state['lastPlayDate'] ?? $state['startDate'] ?? '');
    $timestamp = $rawDate !== '' ? strtotime($rawDate) : false;
    $timestamp = $timestamp === false ? 0 : (int) $timestamp;

    foreach (player_summaries($state) as $player) {
        if (empty($player['claimed']) || !empty($player['open'])) {
            continue;
        }

        $playerName = trim((string) ($player['name'] ?? 'Player')) ?: 'Player';
        $score = max(0, (int) ($player['score'] ?? 0));

        $highlights = merge_leaderboard_highlight($highlights, 'highestGameScore', [
            'gameId' => $gameId,
            'playerName' => $playerName,
            'score' => $score,
            'timestamp' => $timestamp,
            'turnIndex' => turn_index($state)
        ]);
    }

    foreach ((is_array($state['history'] ?? null) ? $state['history'] : []) as $index => $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $words = array_values(array_filter(
            is_array($entry['words'] ?? null) ? $entry['words'] : [],
            static fn($word): bool => is_array($word) && trim((string) ($word['word'] ?? '')) !== ''
        ));

        if (count($words) === 0) {
            continue;
        }

        $turnIndex = max(0, (int) ($entry['turnIndex'] ?? $index));
        $playerName = trim((string) ($entry['playerName'] ?? 'Player')) ?: 'Player';
        $turnScore = 0;
        $turnWords = [];

        foreach ($words as $wordScore) {
            $word = strtoupper(trim((string) ($wordScore['word'] ?? '')));
            $score = max(0, (int) ($wordScore['score'] ?? 0));
            $turnScore += $score;
            $turnWords[] = $word;
            $candidate = [
                'gameId' => $gameId,
                'playerName' => $playerName,
                'word' => $word,
                'score' => $score,
                'timestamp' => $timestamp,
                'turnIndex' => $turnIndex
            ];

            $highlights = merge_leaderboard_highlight($highlights, 'longest', $candidate);
            $highlights = merge_leaderboard_highlight($highlights, 'highestPoints', $candidate);
        }

        $highlights = merge_leaderboard_highlight($highlights, 'recent', [
            'gameId' => $gameId,
            'playerName' => $playerName,
            'word' => $turnWords[0] ?? '',
            'wordCount' => count($words),
            'words' => $turnWords,
            'score' => $turnScore,
            'timestamp' => $timestamp,
            'turnIndex' => $turnIndex
        ]);

        $highlights = merge_leaderboard_highlight($highlights, 'mostWords', [
            'gameId' => $gameId,
            'playerName' => $playerName,
            'wordCount' => count($words),
            'words' => $turnWords,
            'score' => $turnScore,
            'timestamp' => $timestamp,
            'turnIndex' => $turnIndex
        ]);
    }

    foreach ((is_array($state['boardTiles'] ?? null) ? $state['boardTiles'] : []) as $tile) {
        if (!is_array($tile)) {
            continue;
        }

        $stack = is_array($tile['stack'] ?? null) ? $tile['stack'] : [];
        $stackDepth = count($stack) > 0 ? count($stack) : 1;

        if ($stackDepth <= 1) {
            continue;
        }

        $topTile = is_array($stack[$stackDepth - 1] ?? null) ? $stack[$stackDepth - 1] : $tile;
        $highlights = merge_leaderboard_highlight($highlights, 'mostStacked', [
            'gameId' => $gameId,
            'playerName' => '',
            'stackDepth' => $stackDepth,
            'row' => max(0, (int) ($tile['row'] ?? 0)),
            'column' => max(0, (int) ($tile['column'] ?? 0)),
            'letter' => strtoupper(trim((string) ($topTile['letter'] ?? $tile['letter'] ?? ''))),
            'words' => stacked_words_for_board_tile($state, $tile, $stackDepth),
            'timestamp' => $timestamp,
            'turnIndex' => turn_index($state)
        ]);
    }

    return $highlights;
}

function read_archived_leaderboard_stats(string $leaderboardFile): array
{
    if (!is_file($leaderboardFile)) {
        return empty_archived_leaderboard_stats();
    }

    $payload = json_decode((string) file_get_contents($leaderboardFile), true);

    if (!is_array($payload) || !isset($payload['archivedStats']) || !is_array($payload['archivedStats'])) {
        return empty_archived_leaderboard_stats();
    }

    $archivedStats = $payload['archivedStats'];
    $players = [];

    foreach (($archivedStats['players'] ?? []) as $player) {
        if (!is_array($player)) {
            continue;
        }

        $name = trim((string) ($player['name'] ?? ''));
        $key = (string) ($player['key'] ?? '');

        if ($key === '') {
            $key = leaderboard_player_key($player);
        }

        if ($name === '' || $key === '') {
            continue;
        }

        $players[$key] = [
            'key' => $key,
            'name' => $name,
            'authKey' => (string) ($player['authKey'] ?? ''),
            'provider' => (string) ($player['provider'] ?? ''),
            'totalScore' => (int) ($player['totalScore'] ?? 0),
            'games' => (int) ($player['games'] ?? 0)
        ];
    }

    return [
        'totalGamesPlayed' => max(0, (int) ($archivedStats['totalGamesPlayed'] ?? 0)),
        'archivedGameIds' => array_values(array_unique(array_map(
            static fn($id): string => strtoupper(trim((string) $id)),
            is_array($archivedStats['archivedGameIds'] ?? null) ? $archivedStats['archivedGameIds'] : []
        ))),
        'players' => $players,
        'highlights' => normalize_leaderboard_highlights($archivedStats['highlights'] ?? null)
    ];
}

function add_game_to_archived_leaderboard_stats(array $archivedStats, array $state, string $file): array
{
    $gameId = strtoupper((string) ($state['id'] ?? pathinfo($file, PATHINFO_FILENAME)));

    if ($gameId !== '' && in_array($gameId, $archivedStats['archivedGameIds'], true)) {
        return $archivedStats;
    }

    $archivedStats['totalGamesPlayed'] += 1;

    if ($gameId !== '') {
        $archivedStats['archivedGameIds'][] = $gameId;
    }

    $archivedStats['highlights'] = merge_leaderboard_highlights(
        $archivedStats['highlights'] ?? empty_leaderboard_highlights(),
        leaderboard_highlights_for_game($state, $file)
    );

    foreach (player_summaries($state) as $player) {
        $name = trim((string) ($player['name'] ?? ''));
        $key = leaderboard_player_key($player);

        if ($name === '' || $key === '' || empty($player['claimed']) || !empty($player['open'])) {
            continue;
        }

        if (!isset($archivedStats['players'][$key])) {
            $archivedStats['players'][$key] = [
                'key' => $key,
                'name' => $name,
                'authKey' => (string) ($player['authKey'] ?? ''),
                'provider' => (string) ($player['provider'] ?? ''),
                'totalScore' => 0,
                'games' => 0
            ];
        }

        $archivedStats['players'][$key]['key'] = $key;
        $archivedStats['players'][$key]['name'] = $name;
        $archivedStats['players'][$key]['authKey'] = (string) ($player['authKey'] ?? '');
        $archivedStats['players'][$key]['provider'] = (string) ($player['provider'] ?? '');
        $archivedStats['players'][$key]['totalScore'] += (int) ($player['score'] ?? 0);
        $archivedStats['players'][$key]['games'] += 1;
    }

    return $archivedStats;
}

function archive_leaderboard_game(string $leaderboardFile, array $state, string $file): bool
{
    $archivedStats = add_game_to_archived_leaderboard_stats(
        read_archived_leaderboard_stats($leaderboardFile),
        $state,
        $file
    );

    return write_leaderboard($leaderboardFile, build_leaderboard(dirname($file), $leaderboardFile, $archivedStats));
}

function build_leaderboard(string $saveDirectory, string $leaderboardFile, ?array $archivedStats = null): array
{
    $players = [];
    $archivedStats = $archivedStats ?? read_archived_leaderboard_stats($leaderboardFile);
    $archivedGameIds = array_fill_keys($archivedStats['archivedGameIds'], true);
    $totalGamesPlayed = (int) ($archivedStats['totalGamesPlayed'] ?? 0);
    $totalActiveGames = 0;
    $archivedHighlights = normalize_leaderboard_highlights($archivedStats['highlights'] ?? null);
    $highlights = $archivedHighlights;

    foreach (($archivedStats['players'] ?? []) as $key => $player) {
        if (!is_array($player)) {
            continue;
        }

        $name = trim((string) ($player['name'] ?? ''));
        $playerKey = (string) ($player['key'] ?? (string) $key);

        if ($playerKey === '') {
            continue;
        }

        $players[$playerKey] = [
            'key' => $playerKey,
            'name' => $name !== '' ? $name : (string) $key,
            'authKey' => (string) ($player['authKey'] ?? ''),
            'provider' => (string) ($player['provider'] ?? ''),
            'totalScore' => (int) ($player['totalScore'] ?? 0),
            'games' => (int) ($player['games'] ?? 0),
            'activeGames' => 0
        ];
    }

    foreach (glob($saveDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $file) {
        $state = json_decode((string) file_get_contents($file), true);

        if (!is_array($state)) {
            continue;
        }

        if (is_unplayed_conceded_game($state)) {
            continue;
        }

        $gameId = strtoupper((string) ($state['id'] ?? pathinfo($file, PATHINFO_FILENAME)));

        if ($gameId !== '' && isset($archivedGameIds[$gameId])) {
            continue;
        }

        $totalGamesPlayed += 1;
        $isActiveGame = empty($state['gameOver']);

        if ($isActiveGame) {
            $totalActiveGames += 1;
        }

        $highlights = merge_leaderboard_highlights(
            $highlights,
            leaderboard_highlights_for_game($state, $file)
        );

        foreach (player_summaries($state) as $player) {
            $name = trim((string) ($player['name'] ?? ''));
            $key = leaderboard_player_key($player);

            if ($name === '' || $key === '' || empty($player['claimed']) || !empty($player['open'])) {
                continue;
            }

            if (!isset($players[$key])) {
                $players[$key] = [
                    'key' => $key,
                    'name' => $name,
                    'authKey' => (string) ($player['authKey'] ?? ''),
                    'provider' => (string) ($player['provider'] ?? ''),
                    'totalScore' => 0,
                    'games' => 0,
                    'activeGames' => 0
                ];
            }

            $players[$key]['key'] = $key;
            $players[$key]['name'] = $name;
            $players[$key]['authKey'] = (string) ($player['authKey'] ?? '');
            $players[$key]['provider'] = (string) ($player['provider'] ?? '');
            $players[$key]['totalScore'] += (int) ($player['score'] ?? 0);
            $players[$key]['games'] += 1;

            if ($isActiveGame) {
                $players[$key]['activeGames'] += 1;
            }
        }
    }

    $playerRows = array_values($players);

    usort(
        $playerRows,
        static fn(array $first, array $second): int =>
            ($second['totalScore'] <=> $first['totalScore']) ?:
            ($second['games'] <=> $first['games']) ?:
            strcasecmp((string) $first['name'], (string) $second['name'])
    );

    return [
        'version' => 2,
        'generatedAt' => gmdate('c'),
        'totalGamesPlayed' => $totalGamesPlayed,
        'totalActiveGames' => $totalActiveGames,
        'highlights' => $highlights,
        'players' => $playerRows,
        'archivedStats' => [
            'totalGamesPlayed' => (int) ($archivedStats['totalGamesPlayed'] ?? 0),
            'archivedGameIds' => array_values($archivedStats['archivedGameIds'] ?? []),
            'players' => array_values($archivedStats['players'] ?? []),
            'highlights' => $archivedHighlights
        ]
    ];
}

function write_leaderboard(string $leaderboardFile, array $leaderboard): bool
{
    $leaderboardDirectory = dirname($leaderboardFile);

    if (!is_dir($leaderboardDirectory)) {
        mkdir($leaderboardDirectory, 0775, true);
    }

    $encodedLeaderboard = json_encode($leaderboard, JSON_PRETTY_PRINT);

    return $encodedLeaderboard !== false && file_put_contents($leaderboardFile, $encodedLeaderboard) !== false;
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
    validate_request_auth(
        $userLoginFile,
        (string) ($_GET['authKey'] ?? $_POST['authKey'] ?? ''),
        (string) ($_GET['sessionToken'] ?? $_POST['sessionToken'] ?? ''),
        'List'
    );
    cleanup_saved_games($saveDirectory, $leaderboardFile);
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

if ($action === 'leaderboard') {
    cleanup_saved_games($saveDirectory, $leaderboardFile);
    $leaderboard = build_leaderboard($saveDirectory, $leaderboardFile);

    if (!write_leaderboard($leaderboardFile, $leaderboard)) {
        send_json(['ok' => false, 'error' => 'Could not write leaderboard stats.'], 500);
    }

    send_json(['ok' => true, 'leaderboard' => $leaderboard]);
}

if ($action === 'oauth_config') {
    send_json([
        'ok' => true,
        'oauth' => read_public_oauth_config($oauthConfigFile),
        'deployment' => [
            'allowLegacyNameLogin' => request_allows_legacy_name_login(),
            'disableNewGames' => request_disables_new_games()
        ]
    ]);
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

    $requestAuthKey = (string) ($_GET['authKey'] ?? $_POST['authKey'] ?? '');
    $requestSessionToken = (string) ($_GET['sessionToken'] ?? $_POST['sessionToken'] ?? '');

    if (request_has_auth_credentials($requestAuthKey, $requestSessionToken)) {
        validate_request_auth(
            $userLoginFile,
            $requestAuthKey,
            $requestSessionToken,
            'Load'
        );
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

if ($action === 'user_login') {
    $provider = (string) ($_GET['provider'] ?? '');
    $userId = normalize_provider_user_id((string) ($_GET['userId'] ?? ''));

    if (is_local_fallback_user_id($userId) && !request_is_local_http()) {
        send_json([
            'ok' => true,
            'found' => false,
            'user' => null
        ]);
    }

    $entry = get_user_login(
        $userLoginFile,
        $provider,
        $userId
    );

    send_json([
        'ok' => true,
        'found' => $entry !== null,
        'user' => $entry !== null ? public_user_login_entry($entry) : null
    ]);
}

if ($action === 'save_user_login') {
    if ($requestMethod !== 'POST') {
        send_json(['ok' => false, 'error' => 'User login save requests must use POST.'], 405);
    }

    $rawBody = (string) file_get_contents('php://input');
    $payload = json_decode($rawBody, true);

    if (!is_array($payload)) {
        send_json(['ok' => false, 'error' => 'Request body must be a JSON object.'], 400);
    }

    $entry = save_user_login(
        $userLoginFile,
        (string) ($payload['provider'] ?? ''),
        (string) ($payload['userId'] ?? ''),
        (string) ($payload['username'] ?? ''),
        (string) ($payload['accessToken'] ?? '')
    );

    if ($entry === null) {
        send_json(['ok' => false, 'error' => 'A valid Google or Facebook login and username are required.'], 400);
    }

    send_json([
        'ok' => true,
        'user' => $entry
    ]);
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
    $requestAuth = validate_request_auth(
        $userLoginFile,
        (string) ($_GET['authKey'] ?? $_POST['authKey'] ?? ''),
        (string) ($_GET['sessionToken'] ?? $_POST['sessionToken'] ?? ''),
        'Save'
    );
    $requestAuthKey = $requestAuth['authKey'];
    $strictAuth = $requestAuth['strictAuth'];

    if ($isNewGame) {
        if (request_disables_new_games()) {
            send_json(['ok' => false, 'error' => 'New games are created at https://wordwefter.com.'], 403);
        }

        if ($strictAuth && !state_has_claimed_player_with_auth_key($state, $requestAuthKey)) {
            send_json(['ok' => false, 'error' => 'Save rejected because this login token is not a player in the new game.'], 403);
        }

        cleanup_saved_games($saveDirectory, $leaderboardFile);
    }

    if (!$isNewGame) {
        $currentState = json_decode((string) file_get_contents($file), true);

        if (!is_array($currentState)) {
            send_json(['ok' => false, 'error' => 'Current saved game is not valid JSON.'], 500);
        }

        $currentTurnIndex = turn_index($currentState);
        $isExistingPlayerSave = state_has_claimed_player_with_auth_key($currentState, $requestAuthKey);
        $isNewPlayerClaim = !$isExistingPlayerSave && state_is_valid_new_player_claim($currentState, $state, $requestAuthKey);

        if ($strictAuth && !$isExistingPlayerSave && !$isNewPlayerClaim) {
            send_json(['ok' => false, 'error' => 'Save rejected because this login token is not a player in this game.'], 403);
        }

        merge_existing_claimed_players_into_incoming($currentState, $state, $requestAuthKey);

        if ($strictAuth && !state_preserves_existing_claimed_auth_keys($currentState, $state)) {
            send_json(['ok' => false, 'error' => 'Save rejected because it changes an existing player login token.'], 403);
        }

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

    if (is_unplayed_conceded_game($state)) {
        if (is_file($file) && !unlink($file)) {
            send_json(['ok' => false, 'error' => 'Could not delete unplayed conceded game.'], 500);
        }

        write_leaderboard($leaderboardFile, build_leaderboard($saveDirectory, $leaderboardFile));

        send_json([
            'ok' => true,
            'saved' => true,
            'deleted' => true,
            'id' => $id,
            'turnIndex' => $incomingTurnIndex,
            'lastPlayDate' => $state['lastPlayDate'],
            'gameState' => $state
        ]);
    }

    $encodedState = json_encode($state, JSON_PRETTY_PRINT);

    if ($encodedState === false || file_put_contents($file, $encodedState) === false) {
        send_json(['ok' => false, 'error' => 'Could not save game.'], 500);
    }

    write_leaderboard($leaderboardFile, build_leaderboard($saveDirectory, $leaderboardFile));

    send_json([
        'ok' => true,
        'saved' => true,
        'id' => $id,
        'turnIndex' => $incomingTurnIndex,
        'lastPlayDate' => $state['lastPlayDate'],
        'gameState' => $state
    ]);
}

send_json(['ok' => false, 'error' => 'Unknown action.'], 400);
