import { createHash } from 'node:crypto';

const DISCORD_EPOCH_MS = 1420070400000;
const CLAIM_TIMEOUT = "1 minute";
const HISTORY_PAGE_LIMIT = 100;
const HISTORY_LOOKBACK_MS = 20 * 60 * 1000;

// A stable nonce is also a visible recovery marker in the sent embed's footer.
// Discord only enforces nonce uniqueness for a few minutes, so the database
// claim and history reconciliation are both required.
export function calendarGiveawayDeliveryId(notificationKey, slot) {
    return createHash('sha256')
        .update(String(notificationKey))
        .update('\0')
        .update(String(slot))
        .digest('hex')
        .slice(0, 24);
}

export function calendarGiveawayMarker(deliveryId) {
    return `Reactus投稿: ${deliveryId}`;
}

async function claimDelivery(pool, deliveryId, channel) {
    const inserted = await pool.query(
        `INSERT INTO calendar_giveaway_posts (delivery_id, guild_id, channel_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (delivery_id) DO NOTHING
         RETURNING claimed_at`,
        [deliveryId, channel.guildId, channel.id],
    );
    if (inserted.rows.length > 0) {
        return { state: 'new', claimedAt: inserted.rows[0].claimed_at };
    }

    // The claim is durable across processes. Do not treat a not-yet-expired
    // claim as a failure and send again from another worker.
    const recovered = await pool.query(
        `UPDATE calendar_giveaway_posts
         SET claimed_at = NOW()
         WHERE delivery_id = $1 AND guild_id = $2 AND channel_id = $3
           AND status = 'CLAIMED'
           AND claimed_at < NOW() - INTERVAL '${CLAIM_TIMEOUT}'
         RETURNING claimed_at`,
        [deliveryId, channel.guildId, channel.id],
    );
    if (recovered.rows.length > 0) {
        return { state: 'recover', claimedAt: recovered.rows[0].claimed_at };
    }

    const existing = await pool.query(
        'SELECT status, message_id FROM calendar_giveaway_posts WHERE delivery_id = $1 AND guild_id = $2 AND channel_id = $3',
        [deliveryId, channel.guildId, channel.id],
    );
    if (existing.rows[0]?.status === 'POSTED') {
        return { state: 'posted', messageId: existing.rows[0].message_id };
    }
    return { state: 'busy' };
}

function createdAtMs(message) {
    if (Number.isFinite(message.createdTimestamp)) return message.createdTimestamp;
    return Number(BigInt(message.id) >> 22n) + DISCORD_EPOCH_MS;
}

export async function findExistingCalendarGiveawayMessage(channel, deliveryId, startTime) {
    if (!channel.messages?.fetch) throw new Error('Discord message history cannot be checked');
    const cutoff = new Date(startTime).getTime() - HISTORY_LOOKBACK_MS;
    if (!Number.isFinite(cutoff)) throw new Error('Invalid calendar giveaway start time');

    const marker = calendarGiveawayMarker(deliveryId);
    const botId = channel.client?.user?.id;
    let before;
    for (let page = 0; page < HISTORY_PAGE_LIMIT; page += 1) {
        const fetched = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        const messages = [...fetched.values()];
        if (messages.length === 0) return null;

        for (const message of messages) {
            if (createdAtMs(message) < cutoff) return null;
            if (botId && message.author?.id !== botId) continue;
            if (message.embeds?.some(embed => String(embed.footer?.text || '').includes(marker))) {
                return message;
            }
        }
        if (messages.length < 100) return null;
        before = messages[messages.length - 1].id;
    }

    // If the history scan is incomplete, fail closed rather than risking a
    // duplicate. The event can be retried on the next monitor run.
    throw new Error(`Discord history scan exceeded ${HISTORY_PAGE_LIMIT} pages for ${deliveryId}`);
}

// One logical calendar item = one durable claim = at most one confirmed post.
// onMessage persists the associated giveaway row before the claim is finalized.
// onPosted is optional best-effort presentation (e.g. adding the message ID).
export async function deliverCalendarGiveawayItem({
    pool, channel, notificationKey, slot, startTime, buildPayload, onMessage, onPosted, logger = console,
}) {
    const deliveryId = calendarGiveawayDeliveryId(notificationKey, slot);
    const marker = calendarGiveawayMarker(deliveryId);
    const claim = await claimDelivery(pool, deliveryId, channel);
    if (claim.state === 'posted') return { skipped: true, messageId: claim.messageId };
    if (claim.state === 'busy') {
        throw new Error(`Giveaway delivery ${deliveryId} is owned by another active attempt`);
    }

    const recovered = claim.state === 'recover'
        ? await findExistingCalendarGiveawayMessage(channel, deliveryId, startTime)
        : null;
    const message = recovered || await channel.send({
        ...buildPayload(marker),
        nonce: deliveryId,
        enforceNonce: true,
    });
    if (onMessage) await onMessage(message);

    const result = await pool.query(
        `UPDATE calendar_giveaway_posts
         SET status = 'POSTED', message_id = $2
         WHERE delivery_id = $1 AND status = 'CLAIMED' AND claimed_at = $3
         RETURNING message_id`,
        [deliveryId, message.id, claim.claimedAt],
    );
    if (result.rowCount !== 1) {
        throw new Error(`Giveaway delivery claim was lost before recording message ${message.id}`);
    }

    if (onPosted) {
        try {
            await onPosted(message, marker);
        } catch (error) {
            logger.warn(`[TaskMonitor] 抽選メッセージ ${message.id} の表示更新に失敗:`, error);
        }
    }
    return { skipped: false, recovered: Boolean(recovered), messageId: message.id };
}
