import { initializeSheetsAPI } from './sheetsAPI.js';
import { getDBPool } from './settingsCache.js';
import {
    buildBackupSheets,
    loadBackupSnapshot,
    writeBackupAtomically,
} from './backupWriter.js';

export function createAutoBackupCoordinator(runBackup) {
    if (typeof runBackup !== 'function') throw new TypeError('runBackup must be a function');

    const states = new Map();

    async function drain(guildId, state) {
        state.running = true;
        try {
            while (state.completedGeneration < state.requestedGeneration) {
                const targetGeneration = state.requestedGeneration;
                let result = false;
                try {
                    result = Boolean(await runBackup(guildId));
                } catch {
                    result = false;
                }

                state.completedGeneration = targetGeneration;
                const completedWaiters = [];
                const pendingWaiters = [];
                for (const waiter of state.waiters) {
                    if (waiter.generation <= targetGeneration) completedWaiters.push(waiter);
                    else pendingWaiters.push(waiter);
                }
                state.waiters = pendingWaiters;
                completedWaiters.forEach(waiter => waiter.resolve(result));
            }
        } finally {
            state.running = false;
            if (state.waiters.length === 0 && state.completedGeneration >= state.requestedGeneration) {
                states.delete(guildId);
            }
        }
    }

    return function queueBackup(guildId) {
        let state = states.get(guildId);
        if (!state) {
            state = {
                requestedGeneration: 0,
                completedGeneration: 0,
                running: false,
                waiters: [],
            };
            states.set(guildId, state);
        }

        const generation = ++state.requestedGeneration;
        const completion = new Promise(resolve => {
            state.waiters.push({ generation, resolve });
        });

        if (!state.running) {
            void drain(guildId, state);
        }
        return completion;
    };
}

async function runAutoBackupOnce(guildId) {
    console.log(`Triggering auto-backup for guild: ${guildId}`);
    try {
        const pool = await getDBPool();
        const snapshot = await loadBackupSnapshot(pool, guildId);
        const backupSheets = buildBackupSheets(guildId, snapshot);

        // Keep the database transaction short: call Google only after the snapshot is complete.
        const { auth, sheets, spreadsheetId } = await initializeSheetsAPI();
        await writeBackupAtomically(sheets, auth, spreadsheetId, backupSheets);

        console.log(`Auto-backup for guild ${guildId} completed successfully.`);
        return true;
    } catch (error) {
        console.error(`Error during auto-backup for guild ${guildId}:`, error);
        return false;
    }
}

const queueAutoBackup = createAutoBackupCoordinator(runAutoBackupOnce);

export async function triggerAutoBackup(guildId) {
    if (!guildId) {
        console.error('Auto-backup triggered without guildId.');
        return false;
    }
    return queueAutoBackup(String(guildId));
}
