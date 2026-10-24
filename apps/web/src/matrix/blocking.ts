// Blocking through the Matrix ignore list (ADR-0005): the homeserver stops delivering an
// ignored user's events and invitations to this account, on every device. The blocked
// person is not told. Blocking hides; it does not delete anything already received.
import { ClientEvent, EventType, type MatrixClient, type MatrixEvent } from "matrix-js-sdk";

/** Users this account ignores, from the `m.ignored_user_list` account data. */
export function listBlocked(client: MatrixClient): string[] {
  const content = client.getAccountData(EventType.IgnoredUserList)?.getContent() as
    { ignored_users?: unknown } | undefined;
  const ignored = content?.ignored_users;
  return ignored && typeof ignored === "object" ? Object.keys(ignored).sort() : [];
}

export function isBlocked(client: MatrixClient, userId: string): boolean {
  return listBlocked(client).includes(userId);
}

/** Add `userId` to the ignore list (no-op when already there). */
export async function blockUser(client: MatrixClient, userId: string): Promise<void> {
  const current = listBlocked(client);
  if (current.includes(userId)) return;
  await client.setIgnoredUsers([...current, userId]);
}

/** Remove `userId` from the ignore list (no-op when absent). */
export async function unblockUser(client: MatrixClient, userId: string): Promise<void> {
  const current = listBlocked(client);
  if (!current.includes(userId)) return;
  await client.setIgnoredUsers(current.filter((u) => u !== userId));
}

/** Call `cb` with the new list whenever the ignore list changes (any device). */
export function watchBlocked(client: MatrixClient, cb: (blocked: string[]) => void): () => void {
  const handler = (ev?: MatrixEvent) => {
    if (ev?.getType() === EventType.IgnoredUserList) cb(listBlocked(client));
  };
  client.on(ClientEvent.AccountData, handler);
  return () => client.removeListener(ClientEvent.AccountData, handler);
}
