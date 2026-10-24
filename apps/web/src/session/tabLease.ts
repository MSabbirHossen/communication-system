// One active tab per device (ADR-0005, THREAT_MODEL TM-26): the SDK's IndexedDB stores must
// not be opened by two clients at once, so a tab holds a Web Locks lease named after the
// device before it creates a client. A later tab sees the lease taken and offers to take
// over; taking over steals the lock, which tells the previous tab to stop its client.
export interface TabLease {
  /** True while this tab holds the lease (updated after takeOver and loss). */
  held: boolean;
  /** Take the lease from whichever tab holds it; that tab is told it lost it. */
  takeOver(): Promise<void>;
  /** Give the lease up (sign-out). */
  release(): void;
}

/** The subset of the Web Locks API used here (navigator.locks), injectable for tests. */
export interface LocksLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown | null) => Promise<unknown>,
  ): Promise<unknown>;
}

export const leaseName = (deviceId: string): string => `cs-tab-${deviceId}`;

function browserLocks(): LocksLike | undefined {
  const nav = (globalThis as { navigator?: { locks?: LocksLike } }).navigator;
  return nav?.locks;
}

/**
 * Acquire the lease for `deviceId` without waiting. Without a locks API (very old
 * browsers, tests) the tab is assumed to be the only one.
 */
export async function acquireTabLease(
  deviceId: string,
  onLost: () => void,
  locks: LocksLike | undefined = browserLocks(),
): Promise<TabLease> {
  if (!locks) return { held: true, takeOver: async () => {}, release: () => {} };
  const name = leaseName(deviceId);
  let releaseHold: (() => void) | null = null;
  let releasedByUs = false;

  const hold = (options: { ifAvailable?: boolean; steal?: boolean }): Promise<boolean> =>
    new Promise((resolveHeld) => {
      locks
        .request(name, options, (lock) => {
          if (!lock) {
            resolveHeld(false);
            return Promise.resolve();
          }
          return new Promise<void>((done) => {
            releaseHold = () => {
              releasedByUs = true;
              releaseHold = null;
              done();
            };
            resolveHeld(true);
          });
        })
        .then(
          () => undefined,
          () => {
            // The request was rejected: another tab stole the lock (AbortError). A lock we
            // released ourselves resolves instead of rejecting.
            resolveHeld(false);
            if (!releasedByUs) {
              releaseHold = null;
              lease.held = false;
              onLost();
            }
          },
        );
    });

  const lease: TabLease = {
    held: await hold({ ifAvailable: true }),
    takeOver: async () => {
      if (lease.held) return;
      releasedByUs = false;
      lease.held = await hold({ steal: true });
    },
    release: () => {
      releaseHold?.();
      lease.held = false;
    },
  };
  return lease;
}
