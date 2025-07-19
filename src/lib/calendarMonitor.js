// /src/lib/calendarMonitor.js (修正案)

import { google } from 'googleapis';
import { initializeDatabase } from '../db/database.js';
import { initializeSheetsAPI } from './sheetsAPI.js';

let isChecking = false; // 処理の同時実行を防ぐロックフラグ

/**
 * データベースに記録された古い通知履歴を削除し、テーブルの肥大化を防ぎます。
 * @param {import('pg').Pool} pool データベース接続プール
 */
async function cleanupNotifiedEvents(pool) {
    try {
        // 6時間以上前に通知したイベントの記録を削除
        const result = await pool.query("DELETE FROM notified_events WHERE notified_at < NOW() - INTERVAL '6 hours'");
        if (result.rowCount > 0) {
            console.log(`[CalendarMonitor] 古い通知履歴を${result.rowCount}件削除しました。`);
        }
    } catch (error) {
        console.error('[CalendarMonitor] 通知履歴のクリーンアップ中にエラーが発生しました:', error);
    }
}

/**
 * 登録されている全てのカレンダー監視設定に基づき、イベントをチェックします。
 * @param {import('discord.js').Client} client Discordクライアント
 */
async function checkCalendarEvents(client) {
    if (isChecking) {
        // 既にチェック中の場合はログを出さずに静かに終了
        return;
    }
    isChecking = true;
    // console.log('[CalendarMonitor] カレンダーイベントのチェックを開始します。'); // この行をコメントアウト

    try {
        const pool = await initializeDatabase();
        
        await cleanupNotifiedEvents(pool);

        const res = await pool.query('SELECT * FROM calendar_monitors');
        const monitors = res.rows;
        if (monitors.length === 0) return;

        const { auth } = await initializeSheetsAPI();
        const calendar = google.calendar({ version: 'v3', auth });

        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 5 * 60 * 1000).toISOString();

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
                    if (notifiedCheck.rows.length > 0) {
                        continue;
                    }

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
        // console.log('[CalendarMonitor] カレンダーイベントのチェックが完了しました。'); // この行をコメントアウト
    }
}

/**
 * カレンダー監視サービスを開始します。
 * @param {import('discord.js').Client} client Discordクライアント
 */
export function startMonitoring(client) {
    const CHECK_INTERVAL_MS = 300000; // 5分

    const runCheck = () => {
        checkCalendarEvents(client)
            .catch(err => console.error('[CalendarMonitor] ハンドルされないループエラー:', err))
            .finally(() => {
                setTimeout(runCheck, CHECK_INTERVAL_MS);
            });
    };

    runCheck();
    
    console.log('✅ Google Calendar monitoring service started.');
}