// src/lib/permissionUtils.js (修正後・完全版)

import { PermissionsBitField } from 'discord.js';
import { get } from './settingsCache.js';

/**
 * Giveaway関連のコマンドを実行する権限があるかチェックする
 * @param {import('discord.js').Interaction} interaction
 * @returns {Promise<boolean>}
 */
export async function hasGiveawayPermission(interaction) {
    if (!interaction.member) return false;

    if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return true;
    }

    const config = await get.guildConfig(interaction.guildId);
    const managerRoles = config?.giveaway_manager_roles || [];
    
    return interaction.member.roles.cache.some(role => managerRoles.includes(role.id));
}