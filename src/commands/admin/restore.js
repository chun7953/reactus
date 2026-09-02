// src/commands/admin/restore.js (修正後・完全版)

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
    PermissionsBitField,
    SlashCommandBuilder,
} from 'discord.js';
import {
    BackupValidationError,
    getBackupMetadataSpec,
    getBackupSheetSpecs,
    validateBackup,
} from '../../lib/backupValidation.js';
import { initializeSheetsAPI } from '../../lib/sheetsAPI.js';
import { restoreGuildSettings } from '../../lib/restoreSettings.js';
import { getDBPool } from '../../lib/settingsCache.js';

const CONFIRMATION_TIMEOUT_MS = 60_000;

function formatCounts(counts) {
    return [
        `リアクション: ${counts.reactions}件`,
        `アナウンス: ${counts.announcements}件`,
        `カレンダー通知: ${counts.calendarMonitors}件`,
        `サーバー設定: ${counts.guildConfigs}件`,
    ].join('\n');
}

async function fetchAndValidateBackup(sheets, auth, spreadsheetId, guildId) {
    const specs = getBackupSheetSpecs(guildId);
    const spreadsheet = await sheets.spreadsheets.get({
        auth,
        spreadsheetId,
        fields: 'sheets.properties.title',
    });
    const sheetTitles = (spreadsheet.data.sheets || [])
        .map(sheet => sheet.properties?.title)
        .filter(Boolean);
    const metadataSpec = getBackupMetadataSpec(guildId);
    const readSpecs = sheetTitles.includes(metadataSpec.sheetName)
        ? [...specs, metadataSpec]
        : specs;

    const response = await sheets.spreadsheets.values.batchGet({
        auth,
        spreadsheetId,
        ranges: readSpecs.map(spec => `${spec.sheetName}!${spec.range}`),
    });

    return validateBackup(guildId, sheetTitles, response.data.valueRanges || []);
}

async function requestConfirmation(interaction, backup) {
    const confirmId = `restore_confirm_${interaction.id}`;
    const cancelId = `restore_cancel_${interaction.id}`;
    let warning = '現在の設定は、次のバックアップ内容で上書きされます。';
    let confirmLabel = 'この内容で復元';
    let confirmStyle = ButtonStyle.Primary;
    if (backup.isEmpty) {
        warning = '⚠️ バックアップは全項目0件です。実行すると、このサーバーの全設定が削除されます。';
        confirmLabel = '全設定を削除';
        confirmStyle = ButtonStyle.Danger;
    } else if (backup.isLegacy) {
        warning = '⚠️ 旧形式バックアップのため、4シートが同じ世代か確認できません。内容を確認して復元してください。';
        confirmLabel = '旧形式から復元';
        confirmStyle = ButtonStyle.Danger;
    }
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel(confirmLabel).setStyle(confirmStyle),
        new ButtonBuilder().setCustomId(cancelId).setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
    );

    const reply = await interaction.editReply({
        content: `${warning}\n\n**復元予定**\n${formatCounts(backup.counts)}\n\n60秒以内に選択してください。`,
        components: [row],
    });

    let decision;
    try {
        decision = await reply.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: component => (
                component.user.id === interaction.user.id
                && [confirmId, cancelId].includes(component.customId)
            ),
            time: CONFIRMATION_TIMEOUT_MS,
        });
    } catch (error) {
        if (error.code !== 'InteractionCollectorError') throw error;
        await interaction.editReply({ content: '⌛ 復元確認がタイムアウトしました。設定は変更されていません。', components: [] });
        return false;
    }

    if (decision.customId === cancelId) {
        await decision.update({ content: '復元をキャンセルしました。設定は変更されていません。', components: [] });
        return false;
    }

    await decision.update({ content: '⏳ バックアップを復元しています…', components: [] });
    return true;
}

export default {
    data: new SlashCommandBuilder()
        .setName('restore')
        .setDescription('Google Sheetsから全てのサーバー設定を復元（上書き）します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const { guildId } = interaction;

        try {
            const { auth, sheets, spreadsheetId } = await initializeSheetsAPI();
            const backup = await fetchAndValidateBackup(sheets, auth, spreadsheetId, guildId);
            const confirmed = await requestConfirmation(interaction, backup);
            if (!confirmed) return;

            // Open the database connection only after external reads, validation, and user confirmation.
            const pool = await getDBPool();
            const counts = await restoreGuildSettings(pool, guildId, backup.data);

            await interaction.editReply({
                content: `✅ 復元完了！ データベースを更新しました。\n(リアクション: ${counts.reactions}件, アナウンス: ${counts.announces}件, カレンダー通知: ${counts.monitors}件, サーバー設定: ${counts.configs}件)`,
                components: [],
            });

        } catch (error) {
            console.error('Restore failed:', error);
            const message = error instanceof BackupValidationError
                ? `❌ ${error.message}\nデータベースは変更されていません。`
                : '復元を完了できませんでした。データベースの変更は保存されていません。';
            await interaction.editReply({ content: message, components: [] });
        }
    },
};
