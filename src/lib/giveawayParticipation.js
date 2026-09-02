const TOGGLE_PARTICIPANT_SQL = `
    UPDATE giveaways
    SET participants = CASE
        WHEN $2 = ANY(COALESCE(participants, '{}'::TEXT[]))
            THEN array_remove(COALESCE(participants, '{}'::TEXT[]), $2)
        ELSE array_append(COALESCE(participants, '{}'::TEXT[]), $2)
    END
    WHERE message_id = $1 AND status = 'RUNNING'
    RETURNING prize, participants, winner_count
`;

export async function toggleGiveawayParticipant(pool, messageId, userId) {
    const result = await pool.query(TOGGLE_PARTICIPANT_SQL, [messageId, userId]);
    const giveaway = result.rows[0];
    if (!giveaway) return null;

    const participants = giveaway.participants || [];
    return {
        ...giveaway,
        participants,
        joined: participants.includes(userId),
    };
}
