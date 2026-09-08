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
                    value: '`/calendarpost post` - 通常の予約・定期投稿を作成\n' +
                           '`/calendarpost giveaway` - 期間付き抽選を予約・定期作成\n' +
                           '`/calendarpost list` - 今後の自動投稿予定を表示\n' +
                           '`/calendarpost delete` - 予定を削除\n' +
                           '`/calendaredit post` - 登録済みの通常投稿を編集\n' +
                           '`/calendaredit giveaway` - 登録済みの抽選予定を編集\n' +
                           '`/register-main-calendar` - サーバーのメインカレンダーを登録\n' +
                           '`/setcalendar` - チャンネルにカレンダー通知を設定\n' +
                           '`/removecalendar` - カレンダー通知設定を解除'
                },
                { name: 'アナウンス機能', value: '`/startannounce` - 自動アナウンスを開始\n`/stopannounce` - アナウンスを停止' },
                {
                    name: '抽選機能',
                    value: '`/giveaway start` - 抽選を今すぐ開始\n' +
                           '`/giveaway schedule` - 単発の抽選を予約\n' +
                           '`/giveaway end` - 抽選を早期終了\n' +
                           '`/giveaway reroll` - 再抽選\n' +
                           '`/giveaway list` - 抽選一覧を表示\n' +
                           '`/giveaway delete` - 抽選を完全削除\n' +
                           '`/giveaway-permission` - 抽選の管理権限を設定'
                },
                {
                    name: 'ユーティリティ',
                    value: '`/poll` - 投票を作成\n' +
                           '`/csvreactions` - リアクションをCSVで集計\n' +
                           '`/listsettings` - 全ての自動設定を一覧表示'
                },
                { name: 'その他', value: '`/feedback` - 開発サーバーのリンクを表示\n`/help` - このヘルプを表示' },
                { name: '管理者向け機能', value: '`/backup` - 設定をバックアップ\n`/restore` - 設定を復元' }
            )
            .setFooter({ text: 'Reactus Bot' });

        await interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
    },
};
