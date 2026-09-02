export async function claimFinishedGiveaway(pool, messageId) {
    const result = await pool.query(
        `UPDATE giveaways
         SET status = 'ENDING'
         WHERE message_id = $1
           AND status = 'RUNNING'
           AND end_time <= NOW()
         RETURNING *`,
        [messageId],
    );
    return result.rows[0] || null;
}

export async function completeClaimedGiveaway(pool, messageId, winners) {
    return pool.query(
        `UPDATE giveaways
         SET status = 'ENDED', winners = $1
         WHERE message_id = $2 AND status = 'ENDING'`,
        [winners, messageId],
    );
}

export async function failClaimedGiveaway(pool, messageId) {
    return pool.query(
        `UPDATE giveaways
         SET status = 'ERRORED'
         WHERE message_id = $1 AND status = 'ENDING'`,
        [messageId],
    );
}

export async function recoverStaleGiveawayClaims(pool) {
    return pool.query(
        `UPDATE giveaways
         SET status = 'RUNNING'
         WHERE status = 'ENDING'
           AND end_time < NOW() - INTERVAL '15 minutes'`,
    );
}
