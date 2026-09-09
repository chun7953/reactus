// src/events/ready.js

import { Events } from 'discord.js';
import { syncApplicationCommands } from '../lib/commandRegistration.js';
import { startMonitoring } from '../lib/taskMonitor.js';
import { warmAllWebScheduleCaches } from '../lib/webCalendarAdmin.js';

export default {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);

        // 起動判定を遅らせないよう、監視は従来どおり即時開始する。
        startMonitoring(client);

        // 管理画面は前回成功した予定一覧をすぐ返し、裏でGoogleカレンダーを更新する。
        // 永続スナップショットがない初回だけ、起動直後にバックグラウンドで作成しておく。
        void warmAllWebScheduleCaches()
            .catch(error => console.warn('[WebAdminCalendar] startup cache warm failed:', error?.message || error));

        // 新しい/変更されたスラッシュコマンドをデプロイ後に自動反映する。
        // 登録失敗はBot本体の起動を妨げず、次回再起動または手動登録で再試行できる。
        void syncApplicationCommands(client.commands)
            .then(count => console.log(`✅ Synced ${count} Discord application commands.`))
            .catch(error => console.error('Discord application command sync failed:', error));
    },
};
