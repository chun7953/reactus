function normalizeHttpStatus(error) {
    const value = error?.response?.status ?? error?.status ?? error?.code;
    const status = Number(value);
    return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function normalizeMilliseconds(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

export function createProviderTelemetry({ now = Date.now } = {}) {
    const googleCalendarMonitor = {
        listRequests: 0,
        listFailures: 0,
        lastFailureAt: null,
        lastFailureStatus: null,
    };
    const discordRest = {
        rateLimitEvents: 0,
        globalRateLimitEvents: 0,
        lastRateLimitAt: null,
        lastRetryAfterMs: null,
        maxRetryAfterMs: 0,
    };

    function timestamp() {
        return new Date(now()).toISOString();
    }

    function recordGoogleCalendarMonitorListRequest() {
        googleCalendarMonitor.listRequests += 1;
    }

    function recordGoogleCalendarMonitorListFailure(error) {
        googleCalendarMonitor.listFailures += 1;
        googleCalendarMonitor.lastFailureAt = timestamp();
        googleCalendarMonitor.lastFailureStatus = normalizeHttpStatus(error);
    }

    function recordDiscordRestRateLimit(data = {}) {
        const retryAfterMs = normalizeMilliseconds(data.retryAfter);
        discordRest.rateLimitEvents += 1;
        if (data.global) discordRest.globalRateLimitEvents += 1;
        discordRest.lastRateLimitAt = timestamp();
        discordRest.lastRetryAfterMs = retryAfterMs;
        if (retryAfterMs !== null) {
            discordRest.maxRetryAfterMs = Math.max(discordRest.maxRetryAfterMs, retryAfterMs);
        }
    }

    function snapshot() {
        return {
            googleCalendarMonitor: { ...googleCalendarMonitor },
            discordRest: { ...discordRest },
        };
    }

    return {
        recordGoogleCalendarMonitorListRequest,
        recordGoogleCalendarMonitorListFailure,
        recordDiscordRestRateLimit,
        snapshot,
    };
}

export const providerTelemetry = createProviderTelemetry();

export function getProviderTelemetry() {
    return providerTelemetry.snapshot();
}
