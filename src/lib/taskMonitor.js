import { google } from 'googleapis';
import { initializeDatabase } from '../db/database.js';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { getAllActiveGiveaways, getAllScheduledGiveaways, getMonitors } from './settingsCache.js';

// --- タスクA: Googleカレンダーのチェック ---
async function checkCalendarEvents(client) {
    console.log('[TaskMonitor] Checking Google Calendar events...');
    // (この関数の内容は、以前のcalendarMonitor.jsからそのまま移動したものです)
    const monitors = await getMonitors();
    if (monitors.length === 0) return;

    try {
        const { auth } = await initializeSheetsAPI();
        const calendar = google.calendar({ version: 'v3', auth });
        const pool = await initializeDatabase();

        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 次の10分をチェック

        for (const monitor of monitors) {
            // (エラーハンドリングや通知ロジックは省略... 以前のコードと同じです)
        }
    } catch (error) {
        console.error('[TaskMonitor] Error during calendar check:', error);
    }
}


// --- タスクB: 終了したGiveawayの抽選実行 ---
async function checkFinishedGiveaways(client) {
    console.log('[TaskMonitor] Checking for finished giveaways...');
    const now = new Date();
    const activeGiveaways = getAllActiveGiveaways();
    
    for (const giveaway of activeGiveaways) {
        if (new Date(giveaway.end_time) <= now) {
            // TODO: ここに抽選を実行し、結果を発表するロジックを実装します (Phase 3)
            console.log(`Giveaway for "${giveaway.prize}" has ended. Time to draw a winner!`);
        }
    }
}

// --- タスクC: 予約・定期Giveawayの開始チェック ---
async function checkScheduledGiveaways(client) {
    console.log('[TaskMonitor] Checking for scheduled giveaways...');
    const now = new Date();
    const scheduledGiveaways = getAllScheduledGiveaways();

    for (const scheduled of scheduledGiveaways) {
        // TODO: ここにcron形式のスケジュールや、start_timeを評価するロジックを実装します (Phase 3)
        // 今は単純な時間比較のプレースホルダーです
        if (scheduled.start_time && new Date(scheduled.start_time) <= now) {
            console.log(`Scheduled giveaway "${scheduled.prize}" is due to start. Sending confirmation...`);
            // TODO: 承認依頼メッセージを送信するロジックを実装します (Phase 3)
        }
    }
}

// --- マスター監視ループ ---
let isRunning = false;
async function runTasks(client) {
    if (isRunning) return;
    isRunning = true;

    console.log(`[TaskMonitor] Running all scheduled tasks at ${new Date().toLocaleString('ja-JP')}...`);
    try {
        await checkCalendarEvents(client);
        await checkFinishedGiveaways(client);
        await checkScheduledGiveaways(client);
    } catch (error) {
        console.error('[TaskMonitor] An unexpected error occurred in the main task loop:', error);
    } finally {
        isRunning = false;
        console.log('[TaskMonitor] All tasks finished.');
    }
}

export function startMonitoring(client) {
    const MONITOR_INTERVAL_MINUTES = 10;
    
    const scheduleNextRun = () => {
        const now = new Date();
        const minutes = now.getMinutes();
        const nextRunMinute = (Math.floor(minutes / MONITOR_INTERVAL_MINUTES) + 1) * MONITOR_INTERVAL_MINUTES;
        
        const nextRunTime = new Date(now);
        nextRunTime.setMinutes(nextRunMinute, 0, 0); // 次のキリの良い時刻 (例: 10:20:00)

        const delay = nextRunTime.getTime() - now.getTime();

        console.log(`[TaskMonitor] Next run scheduled for ${nextRunTime.toLocaleString('ja-JP')} (in ${Math.round(delay/1000)}s)`);

        setTimeout(() => {
            runTasks(client);
            // さらに次の実行をスケジュールする
            setInterval(() => runTasks(client), MONITOR_INTERVAL_MINUTES * 60 * 1000);
        }, delay);
    };

    scheduleNextRun();
    console.log('✅ Master Task Monitoring service started.');
}