// src/lib/logger.js (修正版)

import { WebhookClient, EmbedBuilder } from 'discord.js';

const webhookUrl = process.env.ERROR_WEBHOOK_URL;
export let webhookClient;

if (webhookUrl) {
    try {
        webhookClient = new WebhookClient({ url: webhookUrl });
        console.log('✅ Error reporting webhook is configured.');
    } catch (error) {
        console.error('❌ FATAL: Webhook URL is invalid. Error reporting will be disabled.', error);
    }
} else {
    console.log('⚠️ INFO: ERROR_WEBHOOK_URL is not set. Error reporting to Discord is disabled.');
}

export function logCommandError(interaction, error) {
    if (!webhookClient) return;
    const { commandName, user, guild, channel } = interaction;
    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000) // Red for critical errors
        .setTitle('🚨 Command Execution Error')
        .addFields(
            { name: 'Command', value: `\`/${commandName}\``, inline: true },
            { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
            { name: 'Server', value: `${guild.name} (\`${guild.id}\`)`, inline: true },
            { name: 'Error Message', value: `\`\`\`${error.message}\`\`\`` },
            { name: 'Stack Trace', value: `\`\`\`${(error.stack || 'No stack trace.').substring(0, 1000)}\`\`\`` }
        )
        .setTimestamp();
    webhookClient.send({ username: 'Reactus Error Log', embeds: [errorEmbed] }).catch(console.error);
}

export function logGlobalError(error, type) {
    if (!webhookClient) return;
    const isErrorObject = error instanceof Error;
    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000) // Red for critical errors
        .setTitle(`🚨 Global Error: ${type}`)
        .addFields(
            { name: 'Error Message', value: `\`\`\`${isErrorObject ? error.message : String(error)}\`\`\`` },
            { name: 'Stack Trace', value: `\`\`\`${(isErrorObject ? error.stack : 'N/A').substring(0, 1000)}\`\`\`` }
        )
        .setTimestamp();
    webhookClient.send({ username: 'Reactus Error Log', embeds: [errorEmbed] }).catch(console.error);
}

// ★★★ ここからが新しい関数 ★★★
export function logSystemNotice({ title, fields }) {
    if (!webhookClient) return;
    const noticeEmbed = new EmbedBuilder()
        .setColor(0xFFEB3B) // Yellow for notices/warnings
        .setTitle(title)
        .addFields(fields)
        .setTimestamp();
    webhookClient.send({ username: 'Reactus System Notice', embeds: [noticeEmbed] }).catch(console.error);
}
// ★★★ ここまで ★★★