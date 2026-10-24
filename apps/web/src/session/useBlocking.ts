import { useCallback, useEffect, useState } from "react";
import { blockUser, listBlocked, unblockUser, watchBlocked } from "../matrix/blocking";
import { useSession } from "./SessionProvider";

/** The ignore list and actions on it; updates when the server echoes a change. */
export function useBlockedUsers(): {
  blocked: string[];
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
} {
  const { client } = useSession();
  const [blocked, setBlocked] = useState<string[]>(() => (client ? listBlocked(client) : []));

  useEffect(() => {
    if (!client) return;
    return watchBlocked(client, setBlocked);
  }, [client]);

  const block = useCallback(
    async (userId: string) => {
      if (!client) return;
      await blockUser(client, userId);
      setBlocked((b) => (b.includes(userId) ? b : [...b, userId].sort()));
    },
    [client],
  );
  const unblock = useCallback(
    async (userId: string) => {
      if (!client) return;
      await unblockUser(client, userId);
      setBlocked((b) => b.filter((u) => u !== userId));
    },
    [client],
  );

  return { blocked, block, unblock };
}
