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

        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);

        // ★★★ここからが追記部分です★★★
        console.log(`[CalendarMonitor] 現在時刻 (bot): ${now.toISOString()}`);
        console.log(`[CalendarMonitor] 5分後 (bot): ${fiveMinutesFromNow.toISOString()}`);
        // ★★★追記はここまでです★★★

        for (const monitor of monitors) {
            try {
                const events = await calendar.events.list({
                    calendarId: monitor.calendar_id,
                    timeMin: now.toISOString(),
                    timeMax: fiveMinutesFromNow.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                if (!events.data.items) continue;

                for (const event of events.data.items) {
                    if (notifiedEventIds.has(event.id)) continue;

                    const eventText = `${event.summary || ''} ${event.description || ''}`;
                    const triggerWithBrackets = `【${monitor.trigger_keyword}】`;

                    if (eventText.includes(triggerWithBrackets)) {
                        // ★★★ここからが追記部分です★★★
                        console.log(`[CalendarMonitor] 検出イベント: ${event.summary} (ID: ${event.id})`);
                        console.log(`[CalendarMonitor] イベント開始時刻: ${event.start.dateTime || event.start.date}`);
                        // ★★★追記はここまでです★★★

                        const channel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                        if (!channel) continue;
                        
                        let mentionContent = monitor.mention_role ? `<@&${monitor.mention_role}> ` : '';
                        
                        const descriptionMentions = event.description?.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g) || [];
                        mentionContent += (descriptionMentions || []).join(' ');

                        let message = `**${event.summary || 'タイトルなし'}**`; 
                        
                        if (event.description) {
                            message += `\n${event.description}`; 
                        }

                        if (mentionContent.trim()) {
                            message += `\n\n${mentionContent.trim()}`; 
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