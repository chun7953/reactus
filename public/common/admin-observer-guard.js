const NativeMutationObserver = window.MutationObserver;

if (NativeMutationObserver && !window.__reactusEnhancementObserverGuardInstalled) {
  window.__reactusEnhancementObserverGuardInstalled = true;

  const active = new Set();
  const MAX_CALLBACKS_PER_SECOND = 60;

  class ReactusDeferredMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.pending = [];
      this.scheduled = false;
      this.windowStartedAt = Date.now();
      this.callbackCount = 0;
      this.disconnected = false;
      this.native = new NativeMutationObserver(records => {
        if (this.disconnected) return;
        this.pending.push(...records);
        if (this.scheduled) return;
        this.scheduled = true;
        window.setTimeout(() => this.flush(), 0);
      });
      active.add(this);
    }

    flush() {
      this.scheduled = false;
      if (this.disconnected || !this.pending.length) return;

      const now = Date.now();
      if (now - this.windowStartedAt >= 1000) {
        this.windowStartedAt = now;
        this.callbackCount = 0;
      }
      this.callbackCount += 1;

      if (this.callbackCount > MAX_CALLBACKS_PER_SECOND) {
        const dropped = this.pending.length;
        this.disconnect();
        console.error('[WebAdmin] runaway MutationObserver was disconnected', { dropped });
        document.dispatchEvent(new CustomEvent('reactus:observer-runaway', {
          detail: { dropped },
        }));
        return;
      }

      const records = this.pending.splice(0);
      try {
        this.callback(records, this);
      } catch (error) {
        window.setTimeout(() => { throw error; }, 0);
      }
    }

    observe(target, options) {
      this.disconnected = false;
      active.add(this);
      return this.native.observe(target, options);
    }

    disconnect() {
      this.native.disconnect();
      this.pending.length = 0;
      this.scheduled = false;
      this.disconnected = true;
      active.delete(this);
    }

    takeRecords() {
      const records = this.native.takeRecords();
      if (this.pending.length) records.push(...this.pending.splice(0));
      return records;
    }
  }

  window.MutationObserver = ReactusDeferredMutationObserver;

  window.addEventListener('beforeunload', () => {
    for (const observer of [...active]) observer.disconnect();
  }, { once: true });
}
