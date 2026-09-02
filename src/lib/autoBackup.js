import { initializeSheetsAPI } from './sheetsAPI.js';
import { getDBPool } from './settingsCache.js';
import {
    buildBackupSheets,
    loadBackupSnapshot,
    writeBackupAtomically,
} from './backupWriter.js';

export async function triggerAutoBackup(guildId) {
    if (!guildId) {
        console.error("Auto-backup triggered without guildId.");
        return false;
    }
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
