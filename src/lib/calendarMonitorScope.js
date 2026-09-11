export function monitorsForActiveGuilds(client, monitors) {
    const guildCache = client?.guilds?.cache;
    if (!guildCache || typeof guildCache.has !== 'function') return [];

    return (Array.isArray(monitors) ? monitors : []).filter(monitor => {
        const guildId = String(monitor?.guild_id || '').trim();
        return guildId && guildCache.has(guildId);
    });
}
