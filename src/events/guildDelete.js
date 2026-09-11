import { Events } from 'discord.js';
import { revokeCalendarClaimsForGuild } from '../lib/calendarClaimService.js';

export default {
    name: Events.GuildDelete,
    once: false,
    async execute(guild) {
        try {
            const revoked = await revokeCalendarClaimsForGuild(guild.id);
            if (revoked > 0) {
                console.log(`[CalendarClaim] Revoked ${revoked} calendar claim(s) for departed guild ${guild.id}.`);
            }
        } catch (error) {
            console.error(`[CalendarClaim] Failed to revoke claims for departed guild ${guild.id}:`, error);
        }
    },
};