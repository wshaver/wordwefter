<?php

declare(strict_types=1);

header('Content-Type: application/json');

$dictionaryPath = __DIR__ . '/dictionary.txt';
$letterPoolSize = 380;
$wildcardCount = 10;
$minFrequencyValue = 3;

if (!is_file($dictionaryPath) || !is_readable($dictionaryPath)) {
    http_response_code(500);
    print(json_encode([
        'ok' => false,
        'error' => 'dictionary.txt could not be read.'
    ], JSON_PRETTY_PRINT));
    exit;
}

$letterCounts = array_fill_keys(range('A', 'Z'), 0);
$wordCount = 0;
$totalLetters = 0;
$handle = fopen($dictionaryPath, 'rb');

if ($handle === false) {
    http_response_code(500);
    print(json_encode([
        'ok' => false,
        'error' => 'dictionary.txt could not be opened.'
    ], JSON_PRETTY_PRINT));
    exit;
}

while (($line = fgets($handle)) !== false) {
    $word = strtoupper(trim($line));

    if ($word === '') {
        continue;
    }

    $wordCount += 1;

    foreach (str_split($word) as $letter) {
        if (isset($letterCounts[$letter])) {
            $letterCounts[$letter] += 1;
            $totalLetters += 1;
        }
    }
}

fclose($handle);

$letterFrequency = [];
$letterAllocations = [];
$baselineLetterCount = count($letterCounts) * $minFrequencyValue;
$remainderPoolSize = max(0, $letterPoolSize - $baselineLetterCount);

foreach ($letterCounts as $letter => $count) {
    $frequency = $totalLetters > 0 ? $count / $totalLetters : 0;
    $exactAvailable = $minFrequencyValue + ($frequency * $remainderPoolSize);
    $baseAvailable = (int) floor($exactAvailable);

    $letterFrequency[$letter] = [
        'count' => $count,
        'frequency' => $frequency,
        'percent' => $totalLetters > 0 ? round($frequency * 100, 4) : 0,
        'exactAvailable' => $exactAvailable,
        'available' => $baseAvailable
    ];

    $letterAllocations[] = [
        'letter' => $letter,
        'remainder' => $exactAvailable - $baseAvailable,
        'count' => $count,
        'baseAvailable' => $baseAvailable
    ];
}

$allocatedLetters = array_sum(array_column($letterFrequency, 'available'));
$remainingLetters = max(0, $letterPoolSize - $allocatedLetters);

usort($letterAllocations, static function (array $first, array $second): int {
    $remainderComparison = $second['remainder'] <=> $first['remainder'];

    if ($remainderComparison !== 0) {
        return $remainderComparison;
    }

    $countComparison = $second['count'] <=> $first['count'];

    if ($countComparison !== 0) {
        return $countComparison;
    }

    return $first['letter'] <=> $second['letter'];
});

$remainderAllocations = array_values(array_filter(
    $letterAllocations,
    static fn(array $allocation): bool => $allocation['baseAvailable'] > $minFrequencyValue
));

if (count($remainderAllocations) === 0) {
    $remainderAllocations = $letterAllocations;
}

for ($index = 0; $index < $remainingLetters; $index += 1) {
    $letter = $remainderAllocations[$index % count($remainderAllocations)]['letter'];

    $letterFrequency[$letter]['available'] += 1;
}

$lettersAvailable = [
    '?' => $wildcardCount
];

foreach ($letterFrequency as $letter => $details) {
    $lettersAvailable[$letter] = $details['available'];
}

print(json_encode([
    'ok' => true,
    'source' => basename($dictionaryPath),
    'wordCount' => $wordCount,
    'totalLetters' => $totalLetters,
    'letterPoolSize' => $letterPoolSize,
    'wildcardCount' => $wildcardCount,
    'minFrequencyValue' => $minFrequencyValue,
    'remainderPoolSize' => $remainderPoolSize,
    'totalPoolSize' => $letterPoolSize + $wildcardCount,
    'lettersAvailable' => $lettersAvailable,
    'letters' => $letterFrequency
], JSON_PRETTY_PRINT));
