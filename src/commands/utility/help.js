import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Reactusの使い方とコマンド一覧を表示します。'),
    async execute(interaction) {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Reactus の使い方')
            .setDescription('普段の設定は、まず `/reactus` から開く日本語の管理画面を使うのがおすすめです。コマンドを覚えなくても操作できます。')
            .addFields(
                {
                    name: '🌐 まずはこちら：管理画面',
                    value: '`/reactus` - ブラウザの管理画面を開きます。\n' +
                           '予定・抽選、画像、繰り返し、メンション、月カレンダー、チャンネル下部の案内、自動リアクション、Googleカレンダーと投稿先の設定をまとめて管理できます。'
                },
                {
                    name: 'リアクション管理（コマンドで操作する場合）',
                    value: '`/setreaction` - 自動リアクションを設定\n' +
                           '`/removereaction` - 設定を解除\n' +
                           '`/reacttomessage` - 既存メッセージにリアクションを適用'
                },
                {
                    name: 'カレンダー連携（コマンドで操作する場合）',
                    value: '`/calendarpost post` - 通常の予約・定期投稿を作成\n' +
                           '`/calendarpost giveaway` - 期間付き抽選を予約・定期作成\n' +
                           '`/calendarpost list` - 今後の自動投稿予定を表示\n' +
                           '`/calendarpost delete` - 予定を削除\n' +
                           '`/calendaredit post` - 登録済みの通常投稿を編集\n' +
                           '`/calendaredit giveaway` - 登録済みの抽選予定を編集\n' +
                           '`/verify-calendar` - Googleカレンダーの所有確認（管理者）\n' +
                           '`/register-main-calendar` - サーバーのメインカレンダーを登録\n' +
                           '`/setcalendar` - チャンネルにカレンダー通知を設定\n' +
                           '`/removecalendar` - カレンダー通知設定を解除'
                },
                {
                    name: 'チャンネル下部の案内（コマンドで操作する場合）',
                    value: '`/startannounce` - このチャンネルの下部案内を開始・変更\n' +
                           '`/stopannounce` - このチャンネルの下部案内を停止'
                },
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
                    name: '確認・その他',
                    value: '`/listsettings` - 現在の自動設定を一覧表示\n' +
                           '`/poll` - 投票を作成\n' +
                           '`/csvreactions` - リアクションをCSVで集計\n' +
                           '`/feedback` - 開発サーバーのリンクを表示\n' +
                           '`/help` - このヘルプを表示'
                },
                { name: '管理者向け', value: '`/backup` - 設定をバックアップ\n`/restore` - 設定を復元' }
            )
            .setFooter({ text: 'Reactus' });

        await interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
    },
};
