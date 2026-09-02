const DEFAULT_SHUTDOWN_TIMEOUT_MS = 4000;
const DEFAULT_TASK_DRAIN_TIMEOUT_MS = 1500;

export function closeHttpServer(server) {
    if (!server?.listening) return Promise.resolve();

    return new Promise((resolve, reject) => {
        server.close(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

export function createGracefulShutdown({
    client,
    server,
    stopMonitoring,
    closeDatabase,
    exit = code => process.exit(code),
    logger = console,
    timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
    taskDrainTimeoutMs = DEFAULT_TASK_DRAIN_TIMEOUT_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
}) {
    let shutdownPromise;
    let exitRequested = false;

    function requestExit(code) {
        if (exitRequested) return;
        exitRequested = true;
        exit(code);
    }

    async function runStep(label, action, errors) {
        try {
            await action();
        } catch (error) {
            errors.push(error);
            logger.error(`[Shutdown] ${label}の終了に失敗しました:`, error);
        }
    }

    return function shutdown(signal, { exitCode = 0 } = {}) {
        if (shutdownPromise) return shutdownPromise;

        shutdownPromise = (async () => {
            logger.log(`[Shutdown] ${signal}を受信しました。安全に終了します。`);
            const errors = [];
            const forceExitTimer = setTimeoutFn(() => {
                logger.error(`[Shutdown] ${timeoutMs}ms以内に終了できなかったため強制終了します。`);
                requestExit(1);
            }, timeoutMs);
            forceExitTimer.unref?.();

            await runStep('タスク監視', async () => {
                const drained = await stopMonitoring({ timeoutMs: taskDrainTimeoutMs });
                if (!drained) {
                    logger.warn('[Shutdown] 実行中タスクの待機時間を超えたため、残りの終了処理を続けます。');
                }
            }, errors);
            await runStep('Discord接続', async () => client.destroy(), errors);
            await runStep('HTTPサーバー', () => closeHttpServer(server), errors);
            await runStep('データベース接続', closeDatabase, errors);

            clearTimeoutFn(forceExitTimer);
            const finalExitCode = errors.length === 0 ? exitCode : 1;
            logger.log(`[Shutdown] 終了処理が完了しました (exit=${finalExitCode})。`);
            requestExit(finalExitCode);
            return finalExitCode;
        })();

        return shutdownPromise;
    };
}
