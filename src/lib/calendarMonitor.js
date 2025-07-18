// /src/lib/calendarMonitor.js

import { google } from 'googleapis';
import { initializeDatabase } from '../db/database.js';
import { initializeSheetsAPI } from './sheetsAPI.js';

let notifiedEventIds = new Set();

async function checkCalendarEvents(client) {
    try {
        const pool = await initializeDatabase();
        const res = await pool.query('SELECT * FROM calendar_monitors');
        const monitors = res.rows;
        if (monitors.length === 0) return;

        const { auth } = await initializeSheetsAPI();
        const calendar = google.calendar({ version: 'v3', auth });

        // ★★★ここからが修正部分です★★★
        // 現在時刻をJSTで取得し、RFC3339形式 (+09:00オフセット) にフォーマット
        const now = new Date(); // サーバーのローカル時間 (通常はUTC)
        const jstOffsetMinutes = 9 * 60; // JSTはUTC+9時間
        
        // DateオブジェクトをJSTとして扱い、RFC3339形式にフォーマットするヘルパー関数
        const formatToJST_RFC3339 = (dateObj) => {
            const pad = (num) => num.toString().padStart(2, '0');
            const year = dateObj.getFullYear();
            const month = pad(dateObj.getMonth() + 1);
            const day = pad(dateObj.getDate());
            const hours = pad(dateObj.getHours());
            const minutes = pad(dateObj.getMinutes());
            const seconds = pad(dateObj.getSeconds());
            const ms = dateObj.getMilliseconds().toString().padStart(3, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}+09:00`;
        };

        // DateオブジェクトをJSTに調整 (表示上のJST時刻のDateオブジェクトを作成)
        // new Date()はサーバーのローカルタイムゾーンで作成されるため、UTCとJSTの差を考慮して調整
        const serverUtcOffsetMs = now.getTimezoneOffset() * 60 * 1000; // サーバーのUTCからのオフセット (ミリ秒)
        const jstOffsetMs = jstOffsetMinutes * 60 * 1000; // JSTのUTCからのオフセット (ミリ秒)
        
        // サーバーの現在時刻 (ローカル) をUTCに変換し、そこからJSTオフセットを適用
        const jstNow = new Date(now.getTime() + serverUtcOffsetMs + jstOffsetMs);
        const jstFiveMinutesFromNow = new Date(jstNow.getTime() + 5 * 60000); // JSTで5分後

        const timeMinJST = formatToJST_RFC3339(jstNow);
        const timeMaxJST = formatToJST_RFC3339(jstFiveMinutesFromNow);

        console.log(`[CalendarMonitor] 現在時刻 (JST): ${timeMinJST}`);
        console.log(`[CalendarMonitor] 5分後 (JST): ${timeMaxJST}`);
        // ★★★修正はここまでです★★★

        for (const monitor of monitors) {
            try {
                const events = await calendar.events.list({
                    calendarId: monitor.calendar_id,
                    timeMin: timeMinJST, // JSTオフセット付きの時刻を使用
                    timeMax: timeMaxJST, // JSTオフセット付きの時刻を使用
                    singleEvents: true,
                    orderBy: 'startTime',
                    timeZone: 'Asia/Tokyo', // ★★★この行を追加★★★
                });

                if (!events.data.items) continue;

                for (const event of events.data.items) {
                    // ★★★ここからが追記部分です★★★
                    // クライアント側での最終チェック (APIフィルタリングの保険)
                    const eventStartTime = new Date(event.start.dateTime || event.start.date);
                    if (eventStartTime.getTime() < jstNow.getTime()) {
                        console.log(`[CalendarMonitor] 過去のイベントを除外 (クライアント側): ${event.summary} (開始: ${eventStartTime.toISOString()})`);
                        continue; // JSTで現在時刻より過去のイベントはスキップ
                    }
                    // ★★★追記はここまでです★★★

                    if (notifiedEventIds.has(event.id)) continue;

                    const eventText = `${event.summary || ''} ${event.description || ''}`;
                    const triggerWithBrackets = `【${monitor.trigger_keyword}】`;

                    if (eventText.includes(triggerWithBrackets)) {
                        console.log(`[CalendarMonitor] 検出イベント: ${event.summary} (ID: ${event.id})`);
                        console.log(`[CalendarMonitor] イベント開始時刻: ${event.start.dateTime || event.start.date}`);

                        const channel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                        if (!channel) continue;
                        
                        let allMentions = new Set(); 

                        if (monitor.mention_role) {
                            allMentions.add(`<@&${monitor.mention_role}>`);
                        }

                        let cleanedDescription = event.description || '';
                        const descriptionMentionMatches = cleanedDescription.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g);
                        if (descriptionMentionMatches) {
                            for (const match of descriptionMentionMatches) {
                                allMentions.add(match); 
                            }
                            cleanedDescription = cleanedDescription.replace(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g, '').trim();
                        }

                        const finalMentionsContent = Array.from(allMentions).join(' '); 

                        let message = `**${event.summary || 'タイトルなし'}**`; 
                        
                        if (cleanedDescription) { 
                            message += `\n${cleanedDescription}`;
                        }

                        if (finalMentionsContent.trim()) { 
                            message += `\n\n${finalMentionsContent.trim()}`;
                        }
                        
                        await channel.send(message);
                        notifiedEventIds.add(event.id);
                        setTimeout(() => notifiedEventIds.delete(event.id), 10 * 60000);
                    }
                }
            } catch (calError) {
                console.error(`Error fetching calendar ${monitor.calendar_id}:`, calError.message);
            }
        }
    } catch (error) {
        console.error('Error in checkCalendarEvents main block:', error);
    }
}

export function startMonitoring(client) {
    setInterval(() => checkCalendarEvents(client), 300000);
    console.log('✅ Google Calendar monitoring service started.');
}