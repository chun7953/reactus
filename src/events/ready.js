// src/events/ready.js

import { Events } from 'discord.js';
import { syncApplicationCommands } from '../lib/commandRegistration.js';
import { startMonitoring } from '../lib/taskMonitor.js';

export default {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);

        // 起動判定を遅らせないよう、監視は従来どおり即時開始する。
        startMonitoring(client);

        // 新しい/変更されたスラッシュコマンドをデプロイ後に自動反映する。
        // 登録失敗はBot本体の起動を妨げず、次回再起動または手動登録で再試行できる。
        void syncApplicationCommands(client.commands)
            .then(count => console.log(`✅ Synced ${count} Discord application commands.`))
            .catch(error => console.error('Discord application command sync failed:', error));
    },
};
