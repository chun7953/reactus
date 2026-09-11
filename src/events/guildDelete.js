import { Events } from 'discord.js';
import { revokeCalendarClaimsForGuild } from '../lib/calendarClaimService.js';
import { revokeWebAdminAuthForGuild } from '../lib/webAdminAuth.js';

export default {
    name: Events.GuildDelete,
    once: false,
    async execute(guild) {
        const [claimsResult, authResult] = await Promise.allSettled([
            revokeCalendarClaimsForGuild(guild.id),
            revokeWebAdminAuthForGuild(guild.id),
        ]);

        if (claimsResult.status === 'fulfilled') {
            if (claimsResult.value > 0) {
                console.log(`[CalendarClaim] Revoked ${claimsResult.value} calendar claim(s) for departed guild ${guild.id}.`);
            }
        } else {
            console.error(`[CalendarClaim] Failed to revoke claims for departed guild ${guild.id}:`, claimsResult.reason);
        }

        if (authResult.status === 'fulfilled') {
            const { loginTokens, sessions } = authResult.value;
            if (loginTokens > 0 || sessions > 0) {
                console.log(
                    `[WebAdminAuth] Revoked ${loginTokens} login token(s) and ${sessions} session(s) for departed guild ${guild.id}.`,
                );
            }
        } else {
            console.error(`[WebAdminAuth] Failed to revoke credentials for departed guild ${guild.id}:`, authResult.reason);
        }
    },
};
