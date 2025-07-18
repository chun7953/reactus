// src/lib/calendarMonitor.js

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
                        const channel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                        if (!channel) continue;
                        
                        let mentionContent = monitor.mention_role ? `<@&${monitor.mention_role}> ` : '';
                        
                        const descriptionMentions = event.description?.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g) || [];
                        mentionContent += (descriptionMentions || []).join(' ');

                        // ★★★ここからが修正部分です★★★
                        let message = `**${event.summary || 'タイトルなし'}**`; // タイトル
                        
                        if (event.description) {
                            message += `\n${event.description}`; // 詳細
                        }

                        if (mentionContent.trim()) {
                            message += `\n\n${mentionContent.trim()}`; // メンション
                        }
                        // ★★★修正はここまでです★★★
                        
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