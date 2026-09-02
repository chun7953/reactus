const DEFAULT_STOP_TIMEOUT_MS = 2000;
const DEFAULT_POLL_INTERVAL_MS = 25;

function validateTasks(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new TypeError('tasks must be a non-empty array');
    }

    const names = new Set();
    for (const task of tasks) {
        if (!task?.name || typeof task.run !== 'function' || !Number.isFinite(task.intervalMs) || task.intervalMs <= 0) {
            throw new TypeError('each task requires a unique name, a run function, and a positive intervalMs');
        }
        if (names.has(task.name)) {
            throw new TypeError(`duplicate task name: ${task.name}`);
        }
        names.add(task.name);
    }
}

export function createMonitorController(tasks, {
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    now = Date.now,
    wait = delayMs => new Promise(resolve => setTimeout(resolve, delayMs)),
    logger = console,
} = {}) {
    validateTasks(tasks);

    let started = false;
    let stopping = false;
    let generation = 0;
    let initialRunPromise;
    let intervalHandles = [];
    const activeTasks = new Set();
    const taskStats = new Map(tasks.map(task => [task.name, {
        runs: 0,
        failures: 0,
        lastStartedAt: null,
        lastSucceededAt: null,
        lastFailedAt: null,
        lastDurationMs: null,
    }]));

    function timestamp(value) {
        return new Date(value).toISOString();
    }

    function runTask(task, context) {
        if (stopping || activeTasks.has(task.name)) return Promise.resolve(false);

        const startedAt = now();
        const stats = taskStats.get(task.name);
        activeTasks.add(task.name);
        stats.runs += 1;
        stats.lastStartedAt = timestamp(startedAt);
        return Promise.resolve()
            .then(() => task.run(context))
            .then(() => {
                stats.lastSucceededAt = timestamp(now());
            })
            .catch(error => {
                stats.failures += 1;
                stats.lastFailedAt = timestamp(now());
                logger.error(`[TaskMonitor] ${task.name}タスクループ中にエラー:`, error);
            })
            .finally(() => {
                stats.lastDurationMs = Math.max(0, now() - startedAt);
                activeTasks.delete(task.name);
            })
            .then(() => true);
    }

    async function runInitialTasks(context) {
        for (const task of tasks) {
            if (stopping) return;
            await runTask(task, context);
        }
    }

    function start(context) {
        if (started) {
            logger.warn('[TaskMonitor] 監視サービスは既に起動しています。重複起動を無視します。');
            return false;
        }

        started = true;
        stopping = false;
        generation += 1;
        const startGeneration = generation;
        const pendingInitialRun = runInitialTasks(context).finally(() => {
            if (initialRunPromise === pendingInitialRun) initialRunPromise = undefined;
            if (!started || stopping || generation !== startGeneration) return;
            intervalHandles = tasks.map(task => (
                setIntervalFn(() => void runTask(task, context), task.intervalMs)
            ));
        });
        initialRunPromise = pendingInitialRun;
        return true;
    }

    async function stop({
        timeoutMs = DEFAULT_STOP_TIMEOUT_MS,
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    } = {}) {
        stopping = true;
        generation += 1;
        for (const handle of intervalHandles) clearIntervalFn(handle);
        intervalHandles = [];
        started = false;

        const deadline = now() + Math.max(0, timeoutMs);
        while (activeTasks.size > 0 && now() < deadline) {
            const remainingMs = deadline - now();
            await wait(Math.min(Math.max(1, pollIntervalMs), remainingMs));
        }

        return activeTasks.size === 0;
    }

    function getStatus() {
        return {
            started,
            stopping,
            initializing: Boolean(initialRunPromise),
            activeTasks: [...activeTasks],
            tasks: tasks.map(task => ({
                name: task.name,
                intervalMs: task.intervalMs,
                running: activeTasks.has(task.name),
                ...taskStats.get(task.name),
            })),
        };
    }

    function whenReady() {
        return initialRunPromise || Promise.resolve();
    }

    return { start, stop, getStatus, whenReady };
}
