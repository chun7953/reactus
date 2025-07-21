import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('フィードバック用のDiscordサーバーリンクを表示します。'),
    async execute(interaction) {
        await interaction.reply({
            content: 'フィードバックやご要望は、開発サーバーまでお寄せください！\n[Reactus開発室](https://discord.gg/m6mFzzEQhr)',
            flags: [MessageFlags.Ephemeral],
        });
    },
};