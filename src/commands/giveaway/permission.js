import { SlashCommandBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { cacheDB, getGuildConfig } from '../../lib/settingsCache.js';

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway-permission')
        .setDescription('Giveawayの作成・管理権限を持つロールを設定します。')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('権限を持つロールを追加します。')
                .addRoleOption(option => option.setName('role').setDescription('追加するロール').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('権限を持つロールを削除します。')
                .addRoleOption(option => option.setName('role').setDescription('削除するロール').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('権限を持つロールの一覧を表示します。')
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const subcommand = interaction.options.getSubcommand();
        const role = interaction.options.getRole('role');
        const config = getGuildConfig(interaction.guildId);
        const managerRoles = new Set(config?.giveaway_manager_roles || []);

        if (subcommand === 'add') {
            if (managerRoles.has(role.id)) {
                return interaction.editReply(`ロール ${role} は既に登録されています。`);
            }
            managerRoles.add(role.id);
            await cacheDB.query(
                'INSERT INTO guild_configs (guild_id, giveaway_manager_roles) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET giveaway_manager_roles = $2',
                [interaction.guildId, Array.from(managerRoles)]
            );
            await interaction.editReply(`✅ ロール ${role} にGiveawayの管理権限を付与しました。`);

        } else if (subcommand === 'remove') {
            if (!managerRoles.has(role.id)) {
                return interaction.editReply(`ロール ${role} は登録されていません。`);
            }
            managerRoles.delete(role.id);
            await cacheDB.query('UPDATE guild_configs SET giveaway_manager_roles = $1 WHERE guild_id = $2', [Array.from(managerRoles), interaction.guildId]);
            await interaction.editReply(`✅ ロール ${role} からGiveawayの管理権限を削除しました。`);

        } else if (subcommand === 'list') {
            if (managerRoles.size === 0) {
                return interaction.editReply('現在、Giveawayの管理権限を持つロールは設定されていません。サーバー管理者のみが作成できます。');
            }
            const roleMentions = Array.from(managerRoles).map(id => `<@&${id}>`).join('\n');
            await interaction.editReply(`**Giveaway管理権限を持つロール一覧:**\n${roleMentions}`);
        }
    },
};