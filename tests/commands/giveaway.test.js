import { execute } from '../../src/commands/giveaway/giveaway.js';
import * as settingsCache from '../../src/lib/settingsCache.js';
import * as permissionUtils from '../../src/lib/permissionUtils.js';

// ------------------- モック（偽のオブジェクト）設定 -------------------
jest.mock('../../src/lib/settingsCache.js', () => ({
    getActiveGiveaways: jest.fn(),
    cacheDB: {
        query: jest.fn(),
    },
}));

jest.mock('../../src/lib/permissionUtils.js');

const mockInteraction = {
    guildId: 'test-guild-id',
    guild: { 
        channels: { 
            fetch: jest.fn().mockResolvedValue({
                messages: {
                    fetch: jest.fn().mockResolvedValue({
                        reactions: {
                            cache: {
                                get: jest.fn().mockReturnValue({
                                    users: {
                                        fetch: jest.fn().mockResolvedValue(new Map([
                                            ['user1', { bot: false }],
                                            ['user2', { bot: false }],
                                            ['bot1', { bot: true }],
                                        ]))
                                    }
                                })
                            }
                        }
                    })
                }
            })
        } 
    },
    deferReply: jest.fn(() => Promise.resolve()),
    editReply: jest.fn(() => Promise.resolve()),
    reply: jest.fn(() => Promise.resolve()),
    options: {
        getSubcommand: jest.fn(),
        getString: jest.fn(),
    },
};
// --------------------------------------------------------------------

describe('Giveaway Commands', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        permissionUtils.hasGiveawayPermission.mockReturnValue(true); // デフォルトで権限アリ
    });

    describe('権限チェック', () => {
        it('権限がない場合、エラーメッセージを返すこと', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('start');
            permissionUtils.hasGiveawayPermission.mockReturnValue(false); // 権限ナシに設定

            await execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'このコマンドを実行する権限がありません。',
                flags: expect.any(Number),
            });
        });

        it('listコマンドは権限がなくても実行できること', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('list');
            permissionUtils.hasGiveawayPermission.mockReturnValue(false);

            await execute(mockInteraction);

            expect(mockInteraction.reply).not.toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalled();
        });
    });

    describe('/giveaway list', () => {
        it('進行中のGiveawayがない場合、その旨を返信する', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('list');
            settingsCache.getActiveGiveaways.mockReturnValue([]);

            await execute(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: expect.any(Number) });
            expect(mockInteraction.editReply).toHaveBeenCalledWith('現在、このサーバーで進行中のGiveawayはありません。');
        });

        it('進行中のGiveawayがある場合、リストをEmbedで表示する', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('list');
            const fakeGiveaways = [
                { prize: 'Test Prize 1', guild_id: 'g1', channel_id: 'c1', message_id: 'm1', end_time: new Date() },
                { prize: 'Test Prize 2', guild_id: 'g2', channel_id: 'c2', message_id: 'm2', end_time: new Date() },
            ];
            settingsCache.getActiveGiveaways.mockReturnValue(fakeGiveaways);

            await execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({ embeds: [expect.any(Object)] });
        });
    });

    describe('/giveaway reroll', () => {
        it('正常に再抽選できること', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('reroll');
            mockInteraction.options.getString.mockReturnValue('some-message-id');
            
            // DBからの返り値をモック
            settingsCache.cacheDB.query.mockResolvedValue({
                rows: [{ winner_count: 1, channel_id: 'c1' }],
            });

            await execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith('✅ 新しい当選者を再抽選しました。');
        });

        it('参加者が足りない場合、エラーを返すこと', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('reroll');
            mockInteraction.options.getString.mockReturnValue('some-message-id');
            
            settingsCache.cacheDB.query.mockResolvedValue({
                rows: [{ winner_count: 5, channel_id: 'c1' }], // 参加者2名に対し、当選者5名を要求
            });

            await execute(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith('エラー: 当選者数より参加者が少ないため、再抽選できません。');
        });
    });
});