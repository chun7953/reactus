import { google } from 'googleapis';
import { initializeDatabase } from '../db/database.js';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { getMonitors } from './settingsCache.js';

let isChecking = false;

async function cleanupNotifiedEvents(pool) {
    try {
        const result = await pool.query("DELETE FROM notified_events WHERE notified_at < NOW() - INTERVAL '6 hours'");
        if (result.rowCount > 0) {
            console.log(`[CalendarMonitor] 古い通知履歴を${result.rowCount}件削除しました。`);
        }
    } catch (error) {
        console.error('[CalendarMonitor] 通知履歴のクリーンアップ中にエラーが発生しました:', error);
    }
}

async function checkCalendarEvents(client, lookaheadMinutes) {
    if (isChecking) return;
    isChecking = true;

    try {
        const pool = await initializeDatabase();
        await cleanupNotifiedEvents(pool);
        
        const monitors = await getMonitors();
        if (monitors.length === 0) return;

        const { auth } = await initializeSheetsAPI();
        const calendar = google.calendar({ version: 'v3', auth });

        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + lookaheadMinutes * 60 * 1000).toISOString();

        for (const monitor of monitors) {
            try {
                const events = await calendar.events.list({
                    calendarId: monitor.calendar_id,
                    timeMin,
                    timeMax,
                    singleEvents: true,
                    orderBy: 'startTime',
                    timeZone: 'Asia/Tokyo',
                });

                if (!events.data.items) continue;

                for (const event of events.data.items) {
                    const notifiedCheck = await pool.query('SELECT 1 FROM notified_events WHERE event_id = $1', [event.id]);
                    if (notifiedCheck.rows.length > 0) continue;

                    const eventText = `${event.summary || ''} ${event.description || ''}`;
                    const triggerWithBrackets = `【${monitor.trigger_keyword}】`;

                    if (eventText.includes(triggerWithBrackets)) {
                        await pool.query('INSERT INTO notified_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING', [event.id]);
                        console.log(`[CalendarMonitor] 検出イベント: ${event.summary} (ID: ${event.id})`);
                        const channel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                        if (!channel) {
                            console.error(`[CalendarMonitor] チャンネル(ID: ${monitor.channel_id})が見つかりません。`);
                            continue;
                        }
                        
                        let allMentions = new Set();
                        if (monitor.mention_role) allMentions.add(`<@&${monitor.mention_role}>`);
                        let cleanedDescription = event.description || '';
                        const mentionMatches = cleanedDescription.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g);
                        if (mentionMatches) {
                            mentionMatches.forEach(m => allMentions.add(m));
                            cleanedDescription = cleanedDescription.replace(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g, '').trim();
                        }
                        const finalMentions = Array.from(allMentions).join(' ');
                        let message = `**${event.summary || 'タイトルなし'}**`;
                        if (cleanedDescription) message += `\n${cleanedDescription}`;
                        if (finalMentions.trim()) message += `\n\n${finalMentions.trim()}`;
                        
                        await channel.send(message);
                    }
                }
            } catch (calError) {
                console.error(`カレンダー(ID: ${monitor.calendar_id})の取得中にエラー:`, calError.message);
            }
        }
    } catch (error) {
        console.error('カレンダーチェック処理のメインブロックでエラー:', error);
    } finally {
        isChecking = false;
    }
}

export function startMonitoring(client) {
    const checkIntervalMinutes = 10;
    const checkIntervalMs = checkIntervalMinutes * 60 * 1000;

    const runCheck = () => {
        checkCalendarEvents(client, checkIntervalMinutes)
            .catch(err => console.error('[CalendarMonitor] ハンドルされないループエラー:', err))
            .finally(() => {
                setTimeout(runCheck, checkIntervalMs);
            });
    };

    runCheck();
    console.log('✅ Google Calendar monitoring service started.');
}