// src/lib/taskMonitor.js
import { google } from 'googleapis';
import { initializeDatabase } from '../db/database.js';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { getAllActiveGiveaways, getAllScheduledGiveaways, getMonitors, cacheDB } from './settingsCache.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import cronParser from 'cron-parser';

async function checkCalendarEvents(client) {
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
                    
                    // --- カレンダー連携抽選の自動作成 ---
                    if (eventText.includes('【ラキショ】')) {
                        await pool.query('INSERT INTO notified_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING', [event.id]);
                        console.log(`[TaskMonitor] 抽選イベントを検出: ${event.summary}`);
                        try {
                            const descriptionLines = (event.description || '').split('\n').map(line => line.trim()).filter(line => line.length > 0);
                            let prizesToCreate = [];
                            let additionalMessage = [];
                            let allMentions = new Set();

                            for (const line of descriptionLines) {
                                // 景品と当選者数のパターンを検出（例: 【景品A/10】）
                                const prizeMatch = line.match(/^【(.+)\/(\d+)】$/);
                                if (prizeMatch) {
                                    prizesToCreate.push({
                                        prize: prizeMatch[1].trim(),
                                        winnerCount: parseInt(prizeMatch[2], 10)
                                    });
                                } else {
                                    // メンションを抽出し、それ以外は追加メッセージとして扱う
                                    const mentionMatches = line.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g);
                                    if (mentionMatches) {
                                        mentionMatches.forEach(m => allMentions.add(m));
                                        // メンション部分を削除して残りをメッセージとして追加
                                        let cleanedLine = line.replace(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g, '').trim();
                                        if (cleanedLine) additionalMessage.push(cleanedLine);
                                    } else {
                                        additionalMessage.push(line);
                                    }
                                }
                            }

                            let mainSummaryPrize = (event.summary || 'プレゼント').replace('【ラキショ】', '').trim();
                            if (mainSummaryPrize && prizesToCreate.length === 0) {
                                prizesToCreate.push({ prize: mainSummaryPrize, winnerCount: 1 });
                            } else if (prizesToCreate.length === 0) {
                                prizesToCreate.push({ prize: '素敵なプレゼント', winnerCount: 1 });
                            }
                            
                            const startTime = new Date(event.start.dateTime || event.start.date);
                            const endTime = new Date(event.end.dateTime || event.end.date);
                            
                            // メンションロールが設定されていれば追加
                            if (monitor.mention_role) allMentions.add(`<@&${monitor.mention_role}>`);
                            const finalMentions = Array.from(allMentions).join(' ').trim();
                            const finalAdditionalMessage = additionalMessage.join('\n').trim();

                            const giveawayChannel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                            if (giveawayChannel) {
                                for (const prizeInfo of prizesToCreate) {
                                    let descriptionText = `リアクションを押して参加しよう！\n**終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:F>**`;
                                    if (finalAdditionalMessage) {
                                        descriptionText += `\n\n${finalAdditionalMessage}`;
                                    }

                                    const giveawayEmbed = new EmbedBuilder()
                                        .setTitle(`🎉 景品: ${prizeInfo.prize}`)
                                        .setDescription(descriptionText)
                                        .addFields({ name: '当選者数', value: `${prizeInfo.winnerCount}名`, inline: true })
                                        .setColor(0x5865F2)
                                        .setTimestamp(endTime);

                                    const participateButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
                                    const row = new ActionRowBuilder().addComponents(participateButton);
                                    
                                    const messageContent = finalMentions ? `${finalMentions}` : '';
                                    
                                    const message = await giveawayChannel.send({ content: messageContent, embeds: [giveawayEmbed], components: [row] });
                                    
                                    // メッセージIDをEmbedのフッターに追加 (再編集)
                                    giveawayEmbed.setFooter({ text: `メッセージID: ${message.id}` });
                                    await message.edit({ embeds: [giveawayEmbed], components: [row] });

                                    const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                                    await cacheDB.query(sql, [message.id, monitor.guild_id, giveawayChannel.id, prizeInfo.prize, prizeInfo.winnerCount, endTime]);
                                    console.log(`カレンダーから自動作成された抽選「${prizeInfo.prize}」がチャンネル ${giveawayChannel.id} で開始されました。`);
                                }
                            }
                        } catch (e) { console.error(`カレンダーイベント ${event.id} からの自動抽選作成に失敗:`, e); }
                        continue;
                    }

                    // --- 通常のカレンダー通知 ---
                    if (eventText.includes(`【${monitor.trigger_keyword}】`)) {
                        await pool.query('INSERT INTO notified_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING', [event.id]);
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
    } catch (error) { console.error('[TaskMonitor] カレンダーチェック中に予期せぬエラーが発生しました:', error); }
}

async function checkFinishedGiveaways(client) {
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
            const resultEmbed = new EmbedBuilder().setTitle(`🎉 抽選終了: ${giveaway.prize}`).setColor(0x2ECC71).setTimestamp(new Date(giveaway.end_time));
            if (winners.length > 0) {
                resultEmbed.setDescription(`**当選者:**\n${winnerMentions}\n\nおめでとうございます！🎉`);
            } else {
                resultEmbed.setDescription('参加者がいなかったため、当選者はいません。');
            }
            await channel.send({ content: winnerMentions, embeds: [resultEmbed] });
            const endedEmbed = EmbedBuilder.from(message.embeds[0]).setDescription(`**終了しました**\n参加者: ${participants.length}名\n当選者: ${winnerMentions || 'なし'}`).setColor(0x95A5A6);
            await message.edit({ embeds: [endedEmbed], components: [] });
            await cacheDB.query("UPDATE giveaways SET status = 'ENDED', winners = $1 WHERE message_id = $2", [winners, giveaway.message_id]);
            console.log(`抽選「${giveaway.prize}」が終了しました。当選者が発表されました。`);
        } catch (error) {
            console.error(`抽選 ${giveaway.message_id} の処理中にエラー:`, error);
            await cacheDB.query("UPDATE giveaways SET status = 'ERRORED' WHERE message_id = $1", [giveaway.message_id]);
        }
    }
}

async function checkScheduledGiveaways(client) {
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
            const giveawayEmbed = new EmbedBuilder().setTitle(`🎉 景品: ${scheduled.prize}`).setDescription(`リアクションを押して参加しよう！\n**終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:F>**`).addFields({ name: '当選者数', value: `${scheduled.winner_count}名`, inline: true }).setColor(0x5865F2).setTimestamp(endTime);
            const participateButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
            const row = new ActionRowBuilder().addComponents(participateButton);
            const message = await channel.send({ embeds: [giveawayEmbed], components: [row] });
            
            // メッセージIDをEmbedのフッターに追加 (再編集)
            giveawayEmbed.setFooter({ text: `メッセージID: ${message.id}` });
            await message.edit({ embeds: [giveawayEmbed], components: [row] });

            const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
            await cacheDB.query(sql, [message.id, scheduled.guild_id, channel.id, scheduled.prize, scheduled.winner_count, endTime]);
            await cacheDB.query('DELETE FROM scheduled_giveaways WHERE id = $1', [scheduled.id]);
            console.log(`予約された抽選「${scheduled.prize}」がチャンネル ${channel.id} で開始されました。`);
        } catch (error) { console.error(`予約された抽選 ${scheduled.id} の処理中にエラー:`, error); }
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
    } catch (error) { console.error('[TaskMonitor] メインタスクループ中に予期せぬエラーが発生しました:', error); }
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
        setTimeout(() => {
            const runAndSchedule = () => runTasks(client);
            runAndSchedule();
            setInterval(runAndSchedule, MONITOR_INTERVAL_MINUTES * 60 * 1000);
        }, delay);
    };
    scheduleNextRun();
    console.log('✅ マスタータスク監視サービスを開始しました。');
}