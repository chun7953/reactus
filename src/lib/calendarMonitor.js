// /src/lib/calendarMonitor.js (全体修正案)

import { google } from 'googleapis';
import { initializeDatabase } from '../db/database.js';
import { initializeSheetsAPI } from './sheetsAPI.js';

// 通知済みのイベントIDを一時的に保存するSet
// (メモリリークを防ぐため、一定時間後に自動で削除する)
let notifiedEventIds = new Set();

/**
 * Googleカレンダーのイベントを定期的にチェックし、条件に一致するものを通知します。
 * @param {import('discord.js').Client} client Discordクライアント
 */
async function checkCalendarEvents(client) {
    try {
        const pool = await initializeDatabase();
        const res = await pool.query('SELECT * FROM calendar_monitors');
        const monitors = res.rows;

        // 監視対象がなければ処理を終了
        if (monitors.length === 0) {
            return;
        }

        const { auth } = await initializeSheetsAPI();
        const calendar = google.calendar({ version: 'v3', auth });

        // --- ▼▼▼ ここからが修正部分です ▼▼▼ ---
        // 現在時刻と5分後の時刻を、信頼性の高いUTCのISO文字列形式で取得します。
        // これにより、サーバーのタイムゾーンに依存しない、一貫した時刻を扱うことができます。
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        // --- ▲▲▲ 修正はここまでです ▲▲▲ ---

        for (const monitor of monitors) {
            try {
                const events = await calendar.events.list({
                    calendarId: monitor.calendar_id,
                    timeMin: timeMin, // UTC時刻をそのまま使用
                    timeMax: timeMax, // UTC時刻をそのまま使用
                    singleEvents: true,
                    orderBy: 'startTime',
                    // timeZoneパラメータを指定することで、GoogleのAPI側で
                    // timeMinとtimeMaxを日本時間として正しく解釈させます。
                    timeZone: 'Asia/Tokyo',
                });

                if (!events.data.items) continue;

                for (const event of events.data.items) {
                    // 既に通知済みのイベントはスキップ
                    if (notifiedEventIds.has(event.id)) continue;

                    // イベントのタイトルと説明文を結合してキーワード検索の対象にする
                    const eventText = `${event.summary || ''} ${event.description || ''}`;
                    const triggerWithBrackets = `【${monitor.trigger_keyword}】`;

                    if (eventText.includes(triggerWithBrackets)) {
                        console.log(`[CalendarMonitor] 検出イベント: ${event.summary} (ID: ${event.id})`);

                        const channel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                        if (!channel) {
                            console.error(`[CalendarMonitor] チャンネル(ID: ${monitor.channel_id})が見つかりませんでした。`);
                            continue;
                        }

                        let allMentions = new Set();

                        // DBに登録されたロールをメンションに追加
                        if (monitor.mention_role) {
                            allMentions.add(`<@&${monitor.mention_role}>`);
                        }

                        // イベントの説明文に含まれるメンションを抽出して追加
                        let cleanedDescription = event.description || '';
                        const descriptionMentionMatches = cleanedDescription.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g);
                        if (descriptionMentionMatches) {
                            for (const match of descriptionMentionMatches) {
                                allMentions.add(match);
                            }
                            // 元の説明文からはメンションを削除しておく
                            cleanedDescription = cleanedDescription.replace(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g, '').trim();
                        }

                        const finalMentionsContent = Array.from(allMentions).join(' ');

                        // 通知メッセージの組み立て
                        let message = `**${event.summary || 'タイトルなし'}**`;
                        if (cleanedDescription) {
                            message += `\n${cleanedDescription}`;
                        }
                        if (finalMentionsContent.trim()) {
                            message += `\n\n${finalMentionsContent.trim()}`;
                        }

                        await channel.send(message);
                        notifiedEventIds.add(event.id);

                        // 10分後に通知済みIDをSetから削除し、メモリリークを防ぐ
                        setTimeout(() => notifiedEventIds.delete(event.id), 10 * 60 * 1000);
                    }
                }
            } catch (calError) {
                console.error(`カレンダー(ID: ${monitor.calendar_id})の取得中にエラーが発生しました:`, calError.message);
            }
        }
    } catch (error) {
        console.error('カレンダーイベントのチェック処理全体でエラーが発生しました:', error);
    }
}

/**
 * カレンダー監視サービスを開始します。
 * @param {import('discord.js').Client} client Discordクライアント
 */
export function startMonitoring(client) {
    // 5分(300000ミリ秒)ごとにイベントをチェック
    setInterval(() => checkCalendarEvents(client), 300000);
    console.log('✅ Google Calendar monitoring service started.');
}