import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('ボットのコマンド一覧と使い方を表示します。'),
    async execute(interaction) {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Reactus Bot コマンド一覧')
            .setDescription('このボットで利用できるコマンドの一覧です。')
            .addFields(
                { 
                    name: 'リアクション管理', 
                    value: '`/setreaction` - 自動リアクションを設定\n' +
                           '`/removereaction` - 設定を解除\n' +
                           '`/reacttomessage` - 既存メッセージにリアクションを適用'
                },
                {
                    name: 'カレンダー連携',
                    value: '`/register-main-calendar` - サーバーのメインカレンダーを登録\n' +
                           '`/setcalendar` - チャンネルにカレンダー通知を設定\n' +
                           '`/removecalendar` - カレンダー通知設定を解除'
                },
                { name: 'アナウンス機能', value: '`/startannounce` - 自動アナウンスを開始\n`/stopannounce` - アナウンスを停止' },
                { 
                    name: 'ユーティリティ', 
                    value: '`/poll` - 投票を作成（集計ボタン付き）\n' +
                           '`/csvreactions` - リアクションをCSVで集計（公開/非公開を選択可）\n' +
                           '`/listsettings` - 全ての自動設定を一覧表示'
                },
                { name: 'その他', value: '`/feedback` - 開発サーバーのリンクを表示\n`/help` - このヘルプを表示' },
                { name: '管理者向け機能', value: '`/backup` - 設定をバックアップ\n`/restore` - 設定を復元' }
            )
            .setFooter({ text: 'Reactus Bot' });

        await interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
    },
};