// Security notices and incoming verification requests for the signed-in session: a small
// store started when the session is ready and stopped when it ends, exposed to screens
// through context. SDK access goes through injectable deps so screens are testable.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { MatrixClient } from "../matrix/client";
import {
  requestOwnDeviceVerification,
  watchIncomingOwnDeviceRequests,
  type VerificationFlow,
} from "../matrix/verification";
import { watchSecurityEvents, type SecurityNotice } from "../matrix/sessionEvents";
import { useSession } from "./SessionProvider";

export interface SecurityDeps {
  watchSecurityEvents: typeof watchSecurityEvents;
  watchIncomingVerification: typeof watchIncomingOwnDeviceRequests;
  requestVerification: typeof requestOwnDeviceVerification;
}

export const realSecurityDeps: SecurityDeps = {
  watchSecurityEvents,
  watchIncomingVerification: watchIncomingOwnDeviceRequests,
  requestVerification: requestOwnDeviceVerification,
};

export type Notice = { id: number } & (
  SecurityNotice | { kind: "verification_request"; deviceId: string; flow: VerificationFlow }
);

export class SecurityStore {
  private notices: Notice[] = [];
  private incoming = new Map<string, VerificationFlow>();
  private listeners = new Set<() => void>();
  private stops: Array<() => void> = [];
  private nextId = 1;

  constructor(private readonly deps: SecurityDeps) {}

  start(client: MatrixClient): void {
    this.stop();
    this.stops.push(this.deps.watchSecurityEvents(client, (n) => this.push(n)));
    this.stops.push(this.deps.watchIncomingVerification(client, (f) => this.onIncoming(f)));
  }

  /** Unsubscribe and forget everything (the session ended). */
  stop(): void {
    for (const s of this.stops) s();
    this.stops = [];
    for (const f of this.incoming.values()) f.dispose();
    this.incoming.clear();
    this.set([]);
  }

  getSnapshot = (): Notice[] => this.notices;
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  push(n: SecurityNotice): void {
    this.set([...this.notices, { id: this.nextId++, ...n }]);
  }

  dismiss(id: number): void {
    this.set(this.notices.filter((n) => n.id !== id));
  }

  /** An incoming request from my device `deviceId`, if one is pending. */
  incomingFor(deviceId: string): VerificationFlow | undefined {
    return this.incoming.get(deviceId);
  }

  requestVerification(client: MatrixClient, deviceId: string): Promise<VerificationFlow> {
    return this.deps.requestVerification(client, deviceId);
  }

  private onIncoming(flow: VerificationFlow): void {
    const deviceId = flow.getState().otherDeviceId;
    if (!deviceId) return;
    this.incoming.get(deviceId)?.dispose();
    this.incoming.set(deviceId, flow);
    const id = this.nextId++;
    this.set([
      ...this.notices.filter((n) => n.kind !== "verification_request" || n.deviceId !== deviceId),
      { id, kind: "verification_request", deviceId, flow },
    ]);
    const unsub = flow.subscribe(() => {
      const { phase } = flow.getState();
      if (phase === "done" || phase === "cancelled") {
        unsub();
        if (this.incoming.get(deviceId) === flow) this.incoming.delete(deviceId);
        this.dismiss(id);
      }
    });
  }

  private set(next: Notice[]): void {
    this.notices = next;
    this.listeners.forEach((l) => l());
  }
}

const Ctx = createContext<SecurityStore | null>(null);

export function SecurityProvider({ deps, children }: { deps: SecurityDeps; children: ReactNode }) {
  const [store] = useState(() => new SecurityStore(deps));
  const { client, status } = useSession();
  useEffect(() => {
    if (!client || status !== "ready") return;
    store.start(client);
    return () => store.stop();
  }, [client, status, store]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useSecurity(): SecurityStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSecurity must be used within SecurityProvider");
  return s;
}

export function useSecurityNotices(): Notice[] {
  const s = useSecurity();
  return useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);
}
