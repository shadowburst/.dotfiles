<?php

declare(strict_types=1);

namespace PublishEvidence;

use Closure;
use InvalidArgumentException;
use Pest\Browser\Playwright\Artifact;
use Pest\Browser\Playwright\Client;
use Pest\Browser\Playwright\Page;
use ReflectionProperty;
use RuntimeException;
use Throwable;

function record(object $page, string $output, Closure $flow): void
{
    $frames = substr($output, 0, -5).'-frames';
    if (! str_ends_with($output, '.webm')) {
        throw new InvalidArgumentException('Recording output must end in .webm.');
    }
    foreach ([$output, $frames] as $path) {
        if (file_exists($path) || is_link($path)) {
            throw new InvalidArgumentException("Capture output already exists: {$path}; use a fresh path.");
        }
    }
    $directory = dirname($output);
    if (! is_dir($directory) && ! mkdir($directory, 0700, true)) {
        throw new RuntimeException("Cannot create capture directory: {$directory}");
    }

    $native = $page->page();
    if (! $native instanceof Page || ! property_exists($native, 'guid')) {
        throw new RuntimeException('Unsupported Pest browser page; recheck the recording integration.');
    }
    // shortcut: Pest lacks public video export, replace this bridge when Pest exposes it.
    $guid = new ReflectionProperty(Page::class, 'guid')->getValue($native);
    $client = Client::instance();
    $artifact = null;
    foreach ($client->execute($guid, 'screencastStart', [
        'record' => true,
        'sendFrames' => false,
        'size' => $native->viewportSize(),
    ]) as $message) {
        if (isset($message['result']['artifact']['guid'])) {
            $artifact = $message['result']['artifact']['guid'];
        }
    }
    if ($artifact === null) {
        throw new RuntimeException('Playwright returned no recording artifact; recheck the recording integration.');
    }

    $error = null;
    try {
        $flow();
    } catch (Throwable $failure) {
        $error = $failure;
    }
    try {
        foreach ($client->execute($guid, 'screencastStop') as $message) {
        }
        $bytes = new Artifact($artifact)->contents();
        if (! str_starts_with($bytes, "\x1a\x45\xdf\xa3")) {
            throw new RuntimeException('Playwright returned an empty or invalid WebM recording.');
        }
        save($output, $bytes);
        if (strlen($bytes) > 10_000_000) {
            throw new RuntimeException("Recording exceeds 10 MB: {$output}; shorten the flow or use a smaller readable viewport.");
        }
    } catch (Throwable $failure) {
        if ($error === null) {
            throw $failure;
        }
        fwrite(STDERR, 'Recording cleanup also failed: '.$failure->getMessage().PHP_EOL);
    }
    if ($error !== null) {
        throw $error;
    }

    inspect($native, $bytes, $frames);
}

function inspect(Page $page, string $bytes, string $frames): void
{
    if (! mkdir($frames, 0700)) {
        throw new RuntimeException("Cannot create recording frames directory: {$frames}");
    }
    $preview = $page->context()->newPage();
    try {
        $preview->setContent('<video muted></video><canvas></canvas>');
        $timeout = Client::instance()->timeout() ?: 10_000;
        $duration = $preview->evaluate(<<<'JS'
            async ({source, timeout}) => {
                const video = document.querySelector('video');
                await new Promise((resolve, reject) => {
                    const finish = error => {
                        clearTimeout(timer);
                        video.onerror = null;
                        error ? reject(error) : resolve();
                    };
                    const timer = setTimeout(() => finish(new Error('Recording decode timed out')), timeout);
                    video.onerror = () => finish(new Error('Recorded WebM cannot be decoded'));
                    video.requestVideoFrameCallback(() => finish());
                    video.src = source;
                });
                return video.duration;
            }
            JS, ['source' => 'data:video/webm;base64,'.base64_encode($bytes), 'timeout' => $timeout]);
        if ((! is_int($duration) && ! is_float($duration)) || ! is_finite($duration) || $duration <= 0) {
            throw new RuntimeException('Recorded WebM has no finite positive duration.');
        }
        $times = [...range(0, (int) ceil($duration) - 1), max(0, $duration - 0.001)];
        foreach ($times as $index => $seconds) {
            $encoded = $preview->evaluate(<<<'JS'
                async ({seconds, timeout}) => {
                    const video = document.querySelector('video');
                    if (video.currentTime !== seconds) {
                        await new Promise((resolve, reject) => {
                            const finish = error => {
                                clearTimeout(timer);
                                video.onseeked = null;
                                video.onerror = null;
                                error ? reject(error) : resolve();
                            };
                            const timer = setTimeout(() => finish(new Error('Recording seek timed out')), timeout);
                            video.onseeked = () => finish();
                            video.onerror = () => finish(new Error('Recording seek failed'));
                            video.currentTime = seconds;
                        });
                    }
                    const canvas = document.querySelector('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    return canvas.toDataURL('image/png').split(',')[1];
                }
                JS, ['seconds' => $seconds, 'timeout' => $timeout]);
            $png = is_string($encoded) ? base64_decode($encoded, true) : false;
            if ($png === false || ! str_starts_with($png, "\x89PNG\r\n\x1a\n")) {
                throw new RuntimeException('Could not decode a recording frame.');
            }
            save($frames.'/frame-'.sprintf('%02d', $index).'.png', $png);
        }
    } finally {
        $preview->close();
    }
}

function save(string $path, string $bytes): void
{
    $stream = fopen($path, 'xb');
    if ($stream === false) {
        throw new RuntimeException("Cannot create capture file: {$path}");
    }
    try {
        if (fwrite($stream, $bytes) !== strlen($bytes)) {
            throw new RuntimeException("Incomplete capture file: {$path}");
        }
    } finally {
        if (! fclose($stream)) {
            throw new RuntimeException("Cannot close capture file: {$path}");
        }
    }
}
