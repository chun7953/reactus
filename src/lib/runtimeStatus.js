const COMPONENT_NAMES = ['config', 'http', 'modules', 'database', 'discord', 'monitoring'];

export function createRuntimeStatus({ now = Date.now } = {}) {
    const startedAtMs = now();
    const components = Object.fromEntries(COMPONENT_NAMES.map(name => [name, 'starting']));
    let phase = 'starting';

    function setComponent(name, value) {
        if (!COMPONENT_NAMES.includes(name)) {
            throw new RangeError(`Unknown runtime component: ${name}`);
        }
        components[name] = value;
    }

    function markReady() {
        phase = 'ready';
    }

    function markFailed(component) {
        if (component) setComponent(component, 'failed');
        phase = 'failed';
    }

    function markStopping() {
        phase = 'stopping';
    }

    function snapshot(extra = {}) {
        return {
            status: phase === 'ready' ? 'ok' : phase,
            ready: phase === 'ready',
            phase,
            uptime_seconds: Math.max(0, Math.floor((now() - startedAtMs) / 1000)),
            components: { ...components },
            ...extra,
        };
    }

    return { setComponent, markReady, markFailed, markStopping, snapshot };
}
