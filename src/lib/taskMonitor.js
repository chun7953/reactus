// src/lib/taskMonitor.js (最終修正版)

import { google } from 'googleapis';
import { initializeSheetsAPI } from './sheetsAPI.js';
import { get, getDBPool } from './settingsCache.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { logSystemNotice } from './logger.js';
import { deliverAndRecordNotification, recordNotification } from './notificationDelivery.js';
import {
    claimFinishedGiveaway,
    completeClaimedGiveaway,
    failClaimedGiveaway,
    recoverStaleGiveawayClaims,
} from './giveawayLifecycle.js';
import { buildCalendarNotificationKey } from './calendarNotificationKey.js';

function basicDecodeHtmlEntities(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }
    return text.replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/&apos;/g, "'");
}

async function checkCalendarEvents(client) {
    const monitors = await get.allMonitors();
    if (monitors.length === 0) return;

    try {
        const { auth } = await initializeSheetsAPI();
        const calendar = google.calendar({ version: 'v3', auth });
        const pool = await getDBPool();
        await pool.query("DELETE FROM notified_events WHERE notified_at < NOW() - INTERVAL '14 days'");
        const now = new Date();
        const timeMin = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
        const timeMax = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
        
        for (const monitor of monitors) {
            try {
                const events = await calendar.events.list({
                    calendarId: monitor.calendar_id,
                    timeMin, timeMax, singleEvents: true, orderBy: 'startTime', timeZone: 'Asia/Tokyo'
                });
                if (!events.data.items) continue;

                for (const event of events.data.items) {
                    const notificationKey = buildCalendarNotificationKey(monitor, event.id);
                    // Read the legacy raw event ID during the transition to avoid one-time duplicate posts.
                    const notifiedCheck = await pool.query(
                        'SELECT 1 FROM notified_events WHERE event_id = ANY($1::TEXT[]) LIMIT 1',
                        [[event.id, notificationKey]],
                    );
                    if (notifiedCheck.rows.length > 0) continue;

                    const eventEndTime = new Date(event.end.dateTime || event.end.date);
                    if (eventEndTime < now) {
                        await recordNotification(pool, notificationKey);
                        continue;
                    }

                    let eventDescription = event.description || '';
                    eventDescription = basicDecodeHtmlEntities(eventDescription);
                    const eventText = `${event.summary || ''} ${eventDescription}`;

                    if (monitor.trigger_keyword === 'ラキショ' && eventText.includes('【ラキショ】')) {
                        console.log(`[TaskMonitor] 抽選イベントを検出: ${event.summary}`);
                        try {
                            const descriptionLines = eventDescription.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                            let prizesToCreate = [];
                            let additionalMessageContent = [];
                            let allMentionsForSeparatePost = new Set();
                            for (const line of descriptionLines) {
                                const prizeMatch = line.match(/^【(.+)\/(\d+)】$/);
                                if (prizeMatch) {
                                    prizesToCreate.push({ prize: prizeMatch[1].trim(), winnerCount: parseInt(prizeMatch[2], 10) });
                                } else {
                                    const mentionMatches = line.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g);
                                    if (mentionMatches) {
                                        mentionMatches.forEach(m => allMentionsForSeparatePost.add(m));
                                        let cleanedLine = line.replace(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g, '').trim();
                                        if (cleanedLine) additionalMessageContent.push(cleanedLine);
                                    } else {
                                        additionalMessageContent.push(line);
                                    }
                                }
                            }
                            let mainSummaryPrize = (event.summary || 'プレゼント').replace('【ラキショ】', '').trim();
                            if (mainSummaryPrize && prizesToCreate.length === 0) {
                                prizesToCreate.push({ prize: mainSummaryPrize, winnerCount: 1 });
                            } else if (prizesToCreate.length === 0) {
                                prizesToCreate.push({ prize: '素敵なプレゼント', winnerCount: 1 });
                            }
                            const endTime = new Date(event.end.dateTime || event.end.date);
                            if (monitor.mention_role) allMentionsForSeparatePost.add(`<@&${monitor.mention_role}>`);
                            const finalMentionsForSeparatePost = Array.from(allMentionsForSeparatePost).join(' ').trim();
                            const finalAdditionalMessageText = additionalMessageContent.join('\n').trim();
                            const giveawayChannel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                            if (giveawayChannel) {
                                for (const prizeInfo of prizesToCreate) {
                                    const giveawayEmbed = new EmbedBuilder().setTitle(`🎉 景品: ${prizeInfo.prize}`).setDescription(`リアクションを押して参加しよう！\n**終了日時: <t:${Math.floor(endTime.getTime() / 1000)}:F>**`).addFields({ name: '当選者数', value: `${prizeInfo.winnerCount}名`, inline: true }).setColor(0x5865F2).setTimestamp(endTime);
                                    const participateButton = new ButtonBuilder().setCustomId('giveaway_participate').setLabel('参加する').setStyle(ButtonStyle.Primary).setEmoji('🎉');
                                    const row = new ActionRowBuilder().addComponents(participateButton);
                                    const message = await giveawayChannel.send({ embeds: [giveawayEmbed], components: [row] });
                                    giveawayEmbed.setFooter({ text: `メッセージID: ${message.id}` });
                                    await message.edit({ embeds: [giveawayEmbed], components: [row] });
                                    const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
                                    await pool.query(sql, [message.id, monitor.guild_id, giveawayChannel.id, prizeInfo.prize, prizeInfo.winnerCount, endTime]);
                                    console.log(`カレンダーから自動作成された抽選「${prizeInfo.prize}」がチャンネル ${giveawayChannel.id} で開始されました。`);
                                }
                                if (finalAdditionalMessageText || finalMentionsForSeparatePost) {
                                    await giveawayChannel.send(`${finalMentionsForSeparatePost}\n${finalAdditionalMessageText}`.trim());
                                }
                                await recordNotification(pool, notificationKey);
                            } else {
                                console.error(`[TaskMonitor ERROR] 【ラキショ】抽選の投稿先チャンネル ${monitor.channel_id} が見つからないか、アクセスできません。`);
                            }
                        } catch (e) { console.error(`カレンダーイベント ${event.id} からの自動抽選作成に失敗:`, e); }
                        continue;
                    }

                    if (eventText.includes(`【${monitor.trigger_keyword}】`)) {
                        const channel = await client.channels.fetch(monitor.channel_id).catch(() => null);
                        if (!channel) {
                             console.error(`[TaskMonitor ERROR] 指定された通知チャンネル ${monitor.channel_id} が見つからないか、アクセスできません。`);
                             continue;
                        }
                        let allMentions = new Set();
                        if (monitor.mention_role) allMentions.add(`<@&${monitor.mention_role}>`);
                        let cleanedDescription = eventDescription || '';
                        const mentionMatches = cleanedDescription.match(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g);
                        if (mentionMatches) {
                            mentionMatches.forEach(m => allMentions.add(m));
                            cleanedDescription = cleanedDescription.replace(/<@&[0-9]+>|<@[0-9]+>|<@everyone>|<@here>/g, '').trim();
                        }
                        const finalMentions = Array.from(allMentions).join(' ');
                        let message = `**${event.summary || 'タイトルなし'}**`;
                        if (cleanedDescription) message += `\n${cleanedDescription}`;
                        if (finalMentions.trim()) message += `\n\n${finalMentions.trim()}`;
                        try {
                            await deliverAndRecordNotification(pool, notificationKey, () => channel.send(message));
                        } catch (sendError) {
                            console.error(`[TaskMonitor ERROR] カレンダーイベント ${event.id} の通知送信に失敗:`, sendError);
                        }
                    }
                }
            } catch (calError) { console.error(`カレンダー(ID: ${monitor.calendar_id})の取得中にエラー:`, calError.message); }
        }
    } catch (error) { console.error('[TaskMonitor] カレンダーチェック中に予期せぬエラーが発生しました:', error); }
}

async function checkFinishedGiveaways(client) {
    const now = new Date();
    const activeGiveaways = await get.allActiveGiveaways();
    const finishedGiveaways = activeGiveaways.filter(g => new Date(g.end_time) <= now);
    if (finishedGiveaways.length === 0) return;
    const pool = await getDBPool();
    for (const candidate of finishedGiveaways) {
        let giveaway;
        try {
            giveaway = await claimFinishedGiveaway(pool, candidate.message_id);
            if (!giveaway) continue;

            const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
            if (!channel) {
                await failClaimedGiveaway(pool, giveaway.message_id);
                continue;
            }
            const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
            if (!message) {
                await failClaimedGiveaway(pool, giveaway.message_id);
                continue;
            }
            const participants = giveaway.participants || [];
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
            await completeClaimedGiveaway(pool, giveaway.message_id, winners);
            console.log(`抽選「${giveaway.prize}」が終了しました。当選者が発表されました。`);
        } catch (error) {
            console.error(`抽選 ${candidate.message_id} の処理中にエラー:`, error);
            if (giveaway) await failClaimedGiveaway(pool, candidate.message_id);
        }
    }
}

async function checkScheduledGiveaways(client) {
    const now = new Date();
    const scheduledGiveaways = await get.allScheduledGiveaways();
    const dueGiveaways = scheduledGiveaways.filter(g => new Date(g.start_time) <= now);
    const pool = await getDBPool();

    for (const scheduled of dueGiveaways) {
        try {
            const startTime = new Date(scheduled.start_time);
            if (now.getTime() - startTime.getTime() > 60 * 60 * 1000) {
                console.log(`[TaskMonitor] 予約抽選「${scheduled.prize}」(ID: ${scheduled.id})は開始時刻を1時間以上過ぎているため、自動的にキャンセルします。`);
                await pool.query('DELETE FROM scheduled_giveaways WHERE id = $1', [scheduled.id]);
                continue;
            }
            const channel = await client.channels.fetch(scheduled.giveaway_channel_id).catch(() => null);
            if (!channel) {
                await pool.query('DELETE FROM scheduled_giveaways WHERE id = $1', [scheduled.id]);
                continue;
            }
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
            giveawayEmbed.setFooter({ text: `メッセージID: ${message.id}` });
            await message.edit({ embeds: [giveawayEmbed], components: [row] });
            const sql = 'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winner_count, end_time) VALUES ($1, $2, $3, $4, $5, $6)';
            await pool.query(sql, [message.id, scheduled.guild_id, channel.id, scheduled.prize, scheduled.winner_count, endTime]);
            await pool.query('DELETE FROM scheduled_giveaways WHERE id = $1', [scheduled.id]);
            console.log(`予約された抽選「${scheduled.prize}」がチャンネル ${channel.id} で開始されました。`);
        } catch (error) { console.error(`予約された抽選 ${scheduled.id} の処理中にエラー:`, error); }
    }
}

async function recoverInterruptedGiveaways() {
    const pool = await getDBPool();
    try {
        const result = await recoverStaleGiveawayClaims(pool);
        if (result.rowCount > 0) {
            console.log(`[TaskMonitor] 中断された抽選処理 ${result.rowCount}件 を再試行対象に戻しました。`);
        }
    } catch (error) {
        console.error('[TaskMonitor] 中断された抽選処理の復旧中にエラー:', error);
    }
}

async function validateActiveGiveaways(client) {
    const activeGiveaways = await get.allActiveGiveaways();
    if (activeGiveaways.length === 0) return;

    const pool = await getDBPool();
    for (const giveaway of activeGiveaways) {
        try {
            const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
            if (channel) {
                await channel.messages.fetch(giveaway.message_id);
                if (giveaway.validation_fails > 0) {
                    await pool.query("UPDATE giveaways SET validation_fails = 0 WHERE message_id = $1", [giveaway.message_id]);
                }
            } else {
                throw { code: 10003 };
            }
        } catch (error) {
            const FAIL_THRESHOLD = 3;
            if (error.code === 10003 || error.code === 10008) {
                const { rows } = await pool.query("UPDATE giveaways SET validation_fails = validation_fails + 1 WHERE message_id = $1 RETURNING *", [giveaway.message_id]);
                const updatedGiveaway = rows[0];

                if (updatedGiveaway && updatedGiveaway.validation_fails >= FAIL_THRESHOLD) {
                    await pool.query("UPDATE giveaways SET status = 'ERRORED' WHERE message_id = $1", [giveaway.message_id]);
                    const reason = error.code === 10003 ? 'チャンネルが見つかりませんでした' : 'メッセージが見つかりませんでした';
                    console.log(`[TaskMonitor] 進行中抽選 ${giveaway.message_id} は${FAIL_THRESHOLD}回連続で検証に失敗したため、ERROREDに設定します。理由: ${reason}`);
                    logSystemNotice({
                        title: '🧹 自動クリーンアップ通知 (検証失敗)',
                        fields: [
                            { name: '内容', value: `進行中の抽選が${FAIL_THRESHOLD}回連続で検証に失敗したため、自動で整理しました。` },
                            { name: '理由', value: reason },
                            { name: '賞品', value: updatedGiveaway.prize },
                            { name: 'メッセージID', value: `\`${giveaway.message_id}\`` },
                            { name: 'チャンネル', value: `<#${updatedGiveaway.channel_id}>` }
                        ]
                    });
                } else if (updatedGiveaway) {
                    console.log(`[TaskMonitor] 進行中抽選 ${giveaway.message_id} の検証に失敗しました。(${updatedGiveaway.validation_fails}/${FAIL_THRESHOLD})`);
                }
            } else {
                console.error(`[TaskMonitor] 進行中抽選 ${giveaway.message_id} の検証中に予期せぬエラー:`, error.message);
            }
        }
    }
}

async function cleanupOldGiveaways() {
    const pool = await getDBPool();
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await pool.query(
            "DELETE FROM giveaways WHERE status IN ('ENDED', 'ERRORED', 'CANCELLED') AND end_time < $1",
            [thirtyDaysAgo]
        );
        if (result.rowCount > 0) {
            console.log(`[TaskMonitor] 30日以上経過した古い抽選データ ${result.rowCount}件 を削除しました。`);
        }
    } catch (error) {
        console.error('[TaskMonitor] 古い抽選データのクリーンアップ中にエラー:', error);
    }
}

let highFreqIsRunning = false;
async function runHighFrequencyTasks(client) {
    if (highFreqIsRunning) return;
    highFreqIsRunning = true;
    try {
        await recoverInterruptedGiveaways();
        await checkFinishedGiveaways(client);
        await validateActiveGiveaways(client);
        await checkScheduledGiveaways(client);
    } catch (error) { console.error('[TaskMonitor] 高頻度タスクループ中にエラー:', error); }
    finally { highFreqIsRunning = false; }
}

let lowFreqIsRunning = false;
async function runLowFrequencyTasks(client) {
    if (lowFreqIsRunning) return;
    lowFreqIsRunning = true;
    try {
        await checkCalendarEvents(client);
    } catch (error) { console.error('[TaskMonitor] 低頻度タスクループ中にエラー:', error); }
    finally { lowFreqIsRunning = false; }
}

let dailyTaskIsRunning = false;
async function runDailyTasks() {
    if (dailyTaskIsRunning) return;
    dailyTaskIsRunning = true;
    try {
        await cleanupOldGiveaways();
    } catch (error) { console.error('[TaskMonitor] デイリータスクループ中にエラー:', error); }
    finally { dailyTaskIsRunning = false; }
}

export function startMonitoring(client) {
    const HIGH_FREQ_INTERVAL = 1 * 60 * 1000;
    runHighFrequencyTasks(client);
    setInterval(() => runHighFrequencyTasks(client), HIGH_FREQ_INTERVAL);

    const LOW_FREQ_INTERVAL = 10 * 60 * 1000;
    runLowFrequencyTasks(client);
    setInterval(() => runLowFrequencyTasks(client), LOW_FREQ_INTERVAL);
    
    const DAILY_INTERVAL = 24 * 60 * 60 * 1000;
    runDailyTasks();
    setInterval(() => runDailyTasks(), DAILY_INTERVAL);
    
    console.log('✅ タスク監視サービスを開始しました (高頻度: 1分, 低頻度: 10分, デイリー)。');
}
