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
    let intervalHandles = [];
    const activeTasks = new Set();

    function runTask(task, context) {
        if (stopping || activeTasks.has(task.name)) return Promise.resolve(false);

        activeTasks.add(task.name);
        return Promise.resolve()
            .then(() => task.run(context))
            .catch(error => {
                logger.error(`[TaskMonitor] ${task.name}タスクループ中にエラー:`, error);
            })
            .finally(() => activeTasks.delete(task.name))
            .then(() => true);
    }

    function start(context) {
        if (started) {
            logger.warn('[TaskMonitor] 監視サービスは既に起動しています。重複起動を無視します。');
            return false;
        }

        started = true;
        stopping = false;
        intervalHandles = tasks.map(task => {
            void runTask(task, context);
            return setIntervalFn(() => void runTask(task, context), task.intervalMs);
        });
        return true;
    }

    async function stop({
        timeoutMs = DEFAULT_STOP_TIMEOUT_MS,
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    } = {}) {
        stopping = true;
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

    return { start, stop };
}
