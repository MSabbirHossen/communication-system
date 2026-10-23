import { useEffect, useState } from "react";
import {
  getRecipientSecurity,
  watchRecipientSecurity,
  type RecipientSecurity,
} from "../matrix/recipientSecurity";
import { useSession } from "./SessionProvider";

/**
 * The other participant's security state, reloaded when the SDK reports a trust or
 * device change. `null` until the first load completes (or without a client).
 */
export function useRecipientSecurity(userId: string | undefined): RecipientSecurity | null {
  const { client } = useSession();
  const [state, setState] = useState<RecipientSecurity | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!client || !userId) return;
    return watchRecipientSecurity(client, userId, () => setVersion((v) => v + 1));
  }, [client, userId]);

  useEffect(() => {
    if (!client || !userId) return;
    let cancelled = false;
    getRecipientSecurity(client, userId).then(
      (s) => {
        if (!cancelled) setState(s);
      },
      () => {
        if (!cancelled) setState({ userId, identity: "unknown", devices: [], unverifiedCount: 0 });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, userId, version]);

  return state && state.userId === userId ? state : null;
}
