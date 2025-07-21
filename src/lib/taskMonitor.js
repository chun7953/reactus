import { google } from 'googleapis';
import { initializeDatabase } from '../db/database.js';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { getAllActiveGiveaways, getAllScheduledGiveaways, getMonitors, cacheDB } from './settingsCache.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import cronParser from 'cron-parser';

async function checkCalendarEvents(client) {
    console.log('[TaskMonitor] Checking Google Calendar events...');
    const monitors = await getMonitors();
    if (monitors.length === 0) return;
    try {
        const { auth } = await initializeSheetsAPI();
        const calendar = google.calendar({ version: 'v3', auth });
        const pool = await initializeDatabase();
        await pool.query("DELETE FROM notified_events WHERE notified_at < NOW() - INTERVAL '6 hours'");
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        for (const monitor of monitors) {
            try {
                const events = await calendar.events.list({
                    calendarId: monitor.calendar_id, timeMin, timeMax, singleEvents: true, orderBy: 'startTime', timeZone: 'Asia/Tokyo'
                });
                if (!events.data.items) continue;
                for (const event of events.data.items) {
                    const notifiedCheck = await pool.query('SELECT 1 FROM notified_events WHERE event_id = $1', [event.id]);
                    if (notifiedCheck.rows.length > 0) continue;

                    const eventText = `${event.summary || ''} ${event.description || ''}`;
                    
                    // --- カレンダー連携Giveawayの自動作成 ---
                    if (eventText.includes('【ラキショ】')) {
                        await pool.query('INSERT INTO notified_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING', [event.id]);
                        console.log(`[TaskMonitor] Giveaway event found: ${event.summary}`);
                        try {
                            const prize = (event.summary || 'プレゼント').replace('【ラキショ】', '').trim();
                            const description = event.description || '';
                            const winnerCountMatch = description.match(/^(\d+)$/m);
                            const winnerCount = winnerCountMatch ? parseInt(winnerCountMatch[1], 10) : 1;
                            const startTime = new Date(event.start.dateTime || event.start.date);
                            const endTime = new Date(event.end.dateTime || event.end.date);

                            // Giveawayを作成するチャンネルは、カレンダー監視設定と同じチャンネルを使用
                            const giveawayChannel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                            if (giveawayChannel) {
                                const giveawayEmbed = new EmbedBuilder().setTitle(`🎉 Giveaway: ${prize}`).setDescription(`リアクションを押して参加しよう！\n**終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:F>**`).addFields({ name: '当選者数', value: `${winnerCount}名`, inline: true }).setColor(0x5865F2).setTimestamp(endTime);
                                const participateButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
                                const row = new ActionRowBuilder().addComponents(participateButton);
                                const message = await giveawayChannel.send({ embeds: [giveawayEmbed], components: [row] });
                                const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                                await cacheDB.query(sql, [message.id, monitor.guild_id, giveawayChannel.id, prize, winnerCount, endTime]);
                                console.log(`Auto-created giveaway "${prize}" in channel ${giveawayChannel.id}.`);
                            }
                        } catch (e) { console.error(`Failed to auto-create giveaway from calendar event ${event.id}:`, e); }
                        continue; // Giveawayとして処理したので、通常の通知はしない
                    }

                    // --- 通常のカレンダー通知 ---
                    if (eventText.includes(`【${monitor.trigger_keyword}】`)) {
                        await pool.query('INSERT INTO notified_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING', [event.id]);
                        console.log(`[CalendarMonitor] 検出イベント: ${event.summary} (ID: ${event.id})`);
                        const channel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                        if (!channel) continue;
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
            } catch (calError) { console.error(`カレンダー(ID: ${monitor.calendar_id})の取得中にエラー:`, calError.message); }
        }
    } catch (error) { console.error('[TaskMonitor] Error during calendar check:', error); }
}

async function checkFinishedGiveaways(client) {
    console.log('[TaskMonitor] Checking for finished giveaways...');
    const now = new Date();
    const activeGiveaways = getAllActiveGiveaways();
    const finishedGiveaways = activeGiveaways.filter(g => new Date(g.end_time) <= now);
    if (finishedGiveaways.length === 0) return;
    for (const giveaway of finishedGiveaways) {
        try {
            const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
            if (!channel) { await cacheDB.query("UPDATE giveaways SET status = 'ERRORED' WHERE message_id = $1", [giveaway.message_id]); continue; }
            const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
            if (!message) { await cacheDB.query("UPDATE giveaways SET status = 'ERRORED' WHERE message_id = $1", [giveaway.message_id]); continue; }
            
            const participantsResult = await cacheDB.query("SELECT participants FROM giveaways WHERE message_id = $1", [giveaway.message_id]);
            const participants = participantsResult.rows[0]?.participants || [];
            
            let winners = [];
            if (participants.length > 0) {
                const shuffled = [...participants].sort(() => 0.5 - Math.random());
                winners = shuffled.slice(0, giveaway.winner_count);
            }
            
            const winnerMentions = winners.map(id => `<@${id}>`).join(' ');
            const resultEmbed = new EmbedBuilder().setTitle(`🎉 Giveaway終了: ${giveaway.prize}`).setColor(0x2ECC71).setTimestamp(new Date(giveaway.end_time));
            if (winners.length > 0) {
                resultEmbed.setDescription(`**当選者:**\n${winnerMentions}\n\nおめでとうございます！🎉`);
            } else {
                resultEmbed.setDescription('参加者がいなかったため、当選者はいません。');
            }
            await channel.send({ content: winnerMentions, embeds: [resultEmbed] });
            const endedEmbed = EmbedBuilder.from(message.embeds[0]).setDescription(`**終了しました**\n参加者: ${participants.length}名\n当選者: ${winnerMentions || 'なし'}`).setColor(0x95A5A6);
            await message.edit({ embeds: [endedEmbed], components: [] });
            await cacheDB.query("UPDATE giveaways SET status = 'ENDED', winners = $1 WHERE message_id = $2", [winners, giveaway.message_id]);
            console.log(`Giveaway for "${giveaway.prize}" ended. Winners announced.`);
        } catch (error) {
            console.error(`Error processing giveaway ${giveaway.message_id}:`, error);
            await cacheDB.query("UPDATE giveaways SET status = 'ERRORED' WHERE message_id = $1", [giveaway.message_id]);
        }
    }
}

async function checkScheduledGiveaways(client) {
    console.log('[TaskMonitor] Checking for scheduled giveaways...');
    const now = new Date();
    const scheduledGiveaways = getAllScheduledGiveaways();
    const dueOneTime = scheduledGiveaways.filter(g => !g.schedule_cron && new Date(g.start_time) <= now);
    for (const scheduled of dueOneTime) {
        try {
            const channel = await client.channels.fetch(scheduled.giveaway_channel_id).catch(() => null);
            if (!channel) { await cacheDB.query('DELETE FROM scheduled_giveaways WHERE id = $1', [scheduled.id]); continue; }
            let endTime;
            if (scheduled.end_time) {
                endTime = new Date(scheduled.end_time);
            } else {
                endTime = new Date(Date.now() + scheduled.duration_hours * 60 * 60 * 1000);
            }
            const giveawayEmbed = new EmbedBuilder().setTitle(`🎉 Giveaway: ${scheduled.prize}`).setDescription(`リアクションを押して参加しよう！\n**終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:F>**`).addFields({ name: '当選者数', value: `${scheduled.winner_count}名`, inline: true }).setColor(0x5865F2).setTimestamp(endTime);
            const participateButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
            const row = new ActionRowBuilder().addComponents(participateButton);
            const message = await channel.send({ embeds: [giveawayEmbed], components: [row] });
            const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
            await cacheDB.query(sql, [message.id, scheduled.guild_id, channel.id, scheduled.prize, scheduled.winner_count, endTime]);
            await cacheDB.query('DELETE FROM scheduled_giveaways WHERE id = $1', [scheduled.id]);
            console.log(`Scheduled giveaway "${scheduled.prize}" has been started in channel ${channel.id}.`);
        } catch (error) { console.error(`Error processing scheduled giveaway ${scheduled.id}:`, error); }
    }
    const dueRecurring = scheduledGiveaways.filter(g => g.schedule_cron);
    for (const scheduled of dueRecurring) {
        try {
            const options = { currentDate: new Date(now.getTime() - 10 * 60 * 1000), endDate: now, iterator: true, tz: 'Asia/Tokyo' };
            const interval = cronParser.parseExpression(scheduled.schedule_cron, options);
            if (interval.hasNext()) {
                const confirmationChannel = await client.channels.fetch(scheduled.confirmation_channel_id).catch(() => null);
                if (!confirmationChannel) { await cacheDB.query('DELETE FROM scheduled_giveaways WHERE id = $1', [scheduled.id]); continue; }
                const scheduleText = getScheduleText(scheduled.schedule_cron);
                const confirmEmbed = new EmbedBuilder().setTitle('🎁 定期抽選の開催確認').setDescription(`**${scheduleText}**の定期抽選 **「${scheduled.prize}」** を開始しますか？`).setColor(0xFFA500);
                const confirmButton = new ButtonBuilder().setCustomId(`giveaway_confirm_start_${scheduled.id}`).setLabel('はい、開始します').setStyle(ButtonStyle.Success);
                const skipButton = new ButtonBuilder().setCustomId(`giveaway_confirm_skip_${scheduled.id}`).setLabel('いいえ、スキップします').setStyle(ButtonStyle.Danger);
                const row = new ActionRowBuilder().addComponents(confirmButton, skipButton);
                await confirmationChannel.send({ content: `<@&${scheduled.confirmation_role_id}>`, embeds: [confirmEmbed], components: [row] });
                console.log(`Sent confirmation request for recurring giveaway ${scheduled.id}`);
            }
        } catch (error) { console.error(`Error processing recurring giveaway ${scheduled.id}:`, error); }
    }
}

function getScheduleText(cron) {
    const parts = cron.split(' ');
    if (parts.length !== 5) return '毎周期';
    if (parts[4] !== '*') return '毎週';
    if (parts[2] !== '*') return '毎月';
    if (parts[1] !== '*') return '毎日';
    return '毎時間';
}

let isRunning = false;
async function runTasks(client) {
    if (isRunning) return;
    isRunning = true;
    try {
        await checkCalendarEvents(client);
        await checkFinishedGiveaways(client);
        await checkScheduledGiveaways(client);
    } catch (error) { console.error('[TaskMonitor] An unexpected error occurred in the main task loop:', error); }
    finally { isRunning = false; }
}

export function startMonitoring(client) {
    const MONITOR_INTERVAL_MINUTES = 10;
    const scheduleNextRun = () => {
        const now = new Date();
        const minutes = now.getMinutes();
        const nextRunMinute = (Math.floor(minutes / MONITOR_INTERVAL_MINUTES) + 1) * MONITOR_INTERVAL_MINUTES;
        const nextRunTime = new Date(now);
        nextRunTime.setMinutes(nextRunMinute, 0, 0);
        const delay = nextRunTime.getTime() - now.getTime();
        console.log(`[TaskMonitor] Next run scheduled for ${nextRunTime.toLocaleString('ja-JP')} (in ${Math.round(delay/1000)}s)`);
        setTimeout(() => {
            const runAndSchedule = () => runTasks(client);
            runAndSchedule();
            setInterval(runAndSchedule, MONITOR_INTERVAL_MINUTES * 60 * 1000);
        }, delay);
    };
    scheduleNextRun();
    console.log('✅ Master Task Monitoring service started.');
}