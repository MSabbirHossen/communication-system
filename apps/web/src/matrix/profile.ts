// Own profile over the Matrix profile API (ADR-0005: Matrix-native settings in Phase 4).
// The username (localpart) is the account's identity and cannot change; only the
// display name is editable here. Avatars are a later release.
import type { MatrixClient } from "matrix-js-sdk";

export const DISPLAY_NAME_MAX_LENGTH = 100;

export type DisplayNameError = "required" | "too_long";

export interface OwnProfile {
  userId: string;
  /** Display name as the server holds it, or null when none is set. */
  displayName: string | null;
}

export function validateDisplayName(input: string): DisplayNameError | null {
  const name = input.trim();
  if (!name) return "required";
  if (name.length > DISPLAY_NAME_MAX_LENGTH) return "too_long";
  return null;
}

export async function getOwnProfile(client: MatrixClient): Promise<OwnProfile> {
  const userId = client.getUserId();
  if (!userId) throw new Error("client has no user id");
  const profile = await client.getProfileInfo(userId);
  const displayName = profile.displayname?.trim();
  return { userId, displayName: displayName ? displayName : null };
}

/** Set the display name (trimmed); validation errors are thrown before any request. */
export async function setDisplayName(client: MatrixClient, input: string): Promise<string> {
  const error = validateDisplayName(input);
  if (error) throw new Error(`invalid display name: ${error}`);
  const name = input.trim();
  await client.setDisplayName(name);
  return name;
}
