export function createAsyncCache({ ttlMs = 60_000, now = () => Date.now() } = {}) {
    if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new Error('ttlMs must be a non-negative number');

    const entries = new Map();

    async function get(key, loader) {
        const currentTime = now();
        const existing = entries.get(key);
        if (existing?.hasValue && existing.expiresAt > currentTime) {
            return existing.value;
        }
        if (existing?.promise) return existing.promise;

        const loadToken = Symbol(String(key));
        const promise = Promise.resolve()
            .then(loader)
            .then((value) => {
                if (entries.get(key)?.loadToken === loadToken) {
                    entries.set(key, {
                        hasValue: true,
                        value,
                        expiresAt: now() + ttlMs,
                        promise: null,
                        loadToken: null,
                    });
                }
                return value;
            })
            .catch((error) => {
                if (entries.get(key)?.loadToken === loadToken) entries.delete(key);
                throw error;
            });

        entries.set(key, {
            hasValue: Boolean(existing?.hasValue),
            value: existing?.value,
            expiresAt: existing?.expiresAt || 0,
            promise,
            loadToken,
        });
        return promise;
    }

    function invalidate(key) {
        return entries.delete(key);
    }

    function invalidateWhere(predicate) {
        let count = 0;
        for (const key of entries.keys()) {
            if (predicate(key)) {
                entries.delete(key);
                count += 1;
            }
        }
        return count;
    }

    function clear() {
        entries.clear();
    }

    return {
        get,
        invalidate,
        invalidateWhere,
        clear,
        size: () => entries.size,
    };
}
