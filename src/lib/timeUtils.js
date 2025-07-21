/**
 * '10m', '1h', '2d' のような文字列をミリ秒に変換する
 * @param {string} durationStr 期間を表す文字列
 * @returns {number|null} 変換されたミリ秒、または無効な場合はnull
 */
export function parseDuration(durationStr) {
    const regex = /(\d+)\s*(m|h|d)/i;
    const match = durationStr.match(regex);

    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 'm':
            return value * 60 * 1000; // 分
        case 'h':
            return value * 60 * 60 * 1000; // 時間
        case 'd':
            return value * 24 * 60 * 60 * 1000; // 日
        default:
            return null;
    }
}