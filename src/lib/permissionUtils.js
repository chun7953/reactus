// src/lib/permissionUtils.js

import { PermissionsBitField } from 'discord.js';
import { get } from './settingsCache.js';

/**
 * Giveaway関連のコマンドを実行する権限があるかチェックする
 * @param {import('discord.js').Interaction} interaction 
 * @returns {boolean}
 */
export function hasGiveawayPermission(interaction) {
    if (!interaction.member) return false;
    // サーバー管理者かチェック
    if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return true;
    }
    // 設定された権限ロールを持っているかチェック
    const config = get.guildConfig(interaction.guildId);
    const managerRoles = config?.giveaway_manager_roles || [];
    return interaction.member.roles.cache.some(role => managerRoles.includes(role.id));
}