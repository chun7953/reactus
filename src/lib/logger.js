import { WebhookClient, EmbedBuilder } from 'discord.js';
import config from '../config.js';

// 環境変数からWebhook URLを読み込む
const webhookUrl = process.env.ERROR_WEBHOOK_URL;
let webhookClient;

if (webhookUrl) {
    try {
        webhookClient = new WebhookClient({ url: webhookUrl });
        console.log('✅ Error reporting webhook is configured.');
    } catch (error) {
        console.error('Webhook URL is invalid:', error);
    }
}

/**
 * コマンド実行時のエラーをDiscord Webhookに送信する
 * @param {import('discord.js').CommandInteraction} interaction - エラーが発生したインタラクション
 * @param {Error} error - 発生したエラーオブジェクト
 */
export function logCommandError(interaction, error) {
    if (!webhookClient) {
        // Webhookが設定されていない場合は何もしない
        return;
    }

    const { commandName, user, guild, channel } = interaction;

    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000) // Red
        .setTitle('🚨 Command Execution Error')
        .setDescription('An error occurred while executing a slash command.')
        .addFields(
            { name: 'Command', value: `\`/${commandName}\``, inline: true },
            { name: 'User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
            { name: 'Server', value: `${guild.name} (\`${guild.id}\`)`, inline: true },
            { name: 'Channel', value: `${channel.name} (\`${channel.id}\`)`, inline: true },
            { name: 'Error Message', value: `\`\`\`${error.message}\`\`\`` },
            { name: 'Stack Trace', value: `\`\`\`${error.stack.substring(0, 1000)}\`\`\`` } // 1024文字の制限内に収める
        )
        .setTimestamp();

    webhookClient.send({
        username: 'Reactus Error Log',
        avatarURL: 'https://i.imgur.com/vLdG6n3.png', // ボットのアイコンURLなどを設定すると良い
        embeds: [errorEmbed],
    }).catch(console.error);
}