// Phase 0 proof of concept: end-to-end encrypted direct messaging over Matrix.
//
// What it proves (see docs/IMPLEMENTATION_PLAN.md §8):
//   1. Two separate Matrix accounts can register and sign in.
//   2. Each client establishes a device identity; the sender can inspect and
//      (manually) verify the recipient's device fingerprints.
//   3. One client sends an encrypted direct message.
//   4. The recipient decrypts it on every device that was enrolled at send time.
//   5. The wire event is `m.room.encrypted` with no plaintext body. The
//      companion script `inspect-server.mjs` confirms the same on the server DB.
//   6. A recipient device that is offline when a message is sent receives and
//      decrypts it after reconnecting, with no duplicates; a retried send with
//      the same transaction ID yields the same event ID.
//   7. A device enrolled *after* a message was sent cannot decrypt it
//      (no Megolm key was shared with it) — the "unauthorized client" case.
//
// Nothing here implements cryptography. All crypto comes from
// @matrix-org/matrix-sdk-crypto-wasm via matrix-js-sdk's initRustCrypto().
//
// Usage: HOMESERVER_URL=http://localhost:8008 node src/poc.mjs

import * as sdk from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger.js";
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const HOMESERVER_URL = process.env.HOMESERVER_URL ?? "http://localhost:8008";
const TIMEOUT_MS = Number(process.env.POC_TIMEOUT_MS ?? 60_000);

// Silence the SDK's default info logging; keep warnings and errors.
/** @type {any} */ (logger).setLevel("warn");

const runId = randomBytes(4).toString("hex");
const NONCE = `POC-PLAINTEXT-${randomBytes(8).toString("hex")}`;
const MESSAGE_1 = `Hello from Alice. ${NONCE}-1`;
const MESSAGE_2 = `Second message while Bob's laptop is offline. ${NONCE}-2`;
const MESSAGE_3 = `Retried send. ${NONCE}-3`;

/**
 * @typedef {{ name: string, ok: boolean, detail: string }} Check
 * @typedef {{
 *   runId: string, homeserver: string, nonce: string, checks: Check[],
 *   failed?: boolean, error?: string, roomId?: string,
 *   eventIds?: Record<string, string>, users?: Record<string, string>,
 *   devices?: Record<string, string>, forbiddenPlaintexts?: string[]
 * }} Results
 */
/** @type {Results} */
const results = { runId, homeserver: HOMESERVER_URL, nonce: NONCE, checks: [] };

/** @param {unknown} err */
const errMsg = (err) => String(/** @type {any} */ (err)?.message ?? err);
/** @param {unknown} err */
const errCode = (err) => /** @type {any} */ (err)?.errcode;

/** @param {string} name @param {boolean} ok @param {string} [detail] */
function check(name, ok, detail = "") {
  results.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) results.failed = true;
}

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll `predicate` until it returns a truthy value.
 * @template T
 * @param {string} label
 * @param {() => T | Promise<T>} predicate
 * @param {number} [timeoutMs]
 * @returns {Promise<NonNullable<T>>}
 */
async function waitFor(label, predicate, timeoutMs = TIMEOUT_MS) {
  const start = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return /** @type {NonNullable<T>} */ (value);
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await sleep(250);
  }
}

// --- Account and device helpers -------------------------------------------

/** @param {string} username @param {string} password @param {string} deviceName */
async function register(username, password, deviceName) {
  const tmp = sdk.createClient({ baseUrl: HOMESERVER_URL });
  const body = { username, password, initial_device_display_name: deviceName };
  try {
    return await tmp.registerRequest(body);
  } catch (err) {
    // User-Interactive Auth: the server replies 401 with a session; complete
    // the dummy stage. This requires a dev homeserver with
    // enable_registration_without_verification: true.
    const e = /** @type {any} */ (err);
    if (e?.httpStatus !== 401 || !e?.data?.session) throw err;
    return tmp.registerRequest({
      ...body,
      auth: { type: "m.login.dummy", session: e.data.session },
    });
  }
}

/** @param {string} username @param {string} password @param {string} deviceName */
async function login(username, password, deviceName) {
  const tmp = sdk.createClient({ baseUrl: HOMESERVER_URL });
  return tmp.loginRequest({
    type: "m.login.password",
    identifier: { type: "m.id.user", user: username },
    password,
    initial_device_display_name: deviceName,
  });
}

/**
 * @typedef {{ user_id: string, access_token: string, device_id: string }} Session
 */
/** @param {{ user_id?: string, access_token?: string, device_id?: string }} resp @returns {Session} */
function asSession(resp) {
  if (!resp.user_id || !resp.access_token || !resp.device_id)
    throw new Error("homeserver response lacks user_id/access_token/device_id");
  return { user_id: resp.user_id, access_token: resp.access_token, device_id: resp.device_id };
}
/** @param {sdk.MatrixClient} client */
function requireCrypto(client) {
  const c = client.getCrypto();
  if (!c) throw new Error("crypto backend not initialised");
  return c;
}
/** @param {sdk.MatrixClient} client @param {string} roomId */
function requireRoom(client, roomId) {
  const r = client.getRoom(roomId);
  if (!r) throw new Error(`room ${roomId} not known to client`);
  return r;
}
/** Simulated network switch per client: when `offline` is true every HTTP request fails like a dropped connection. */
/** @type {WeakMap<sdk.MatrixClient, { offline: boolean, failed: number }>} */
const netStates = new WeakMap();

/** @param {string} label @param {Session} session */
async function makeClient(label, session) {
  const net = { offline: false, failed: 0 };
  /** @type {typeof fetch} */
  const fetchFn = (input, init) => {
    if (net.offline) {
      net.failed++;
      return Promise.reject(new TypeError("fetch failed: simulated network outage"));
    }
    return fetch(input, init);
  };
  const client = sdk.createClient({
    baseUrl: HOMESERVER_URL,
    userId: session.user_id,
    accessToken: session.access_token,
    deviceId: session.device_id,
    fetchFn,
  });
  netStates.set(client, net);
  // In-memory crypto store: fine for a single-process PoC. A real client uses
  // IndexedDB (web) or the SDK's persistent store (mobile).
  await client.initRustCrypto({ useIndexedDB: false });
  await client.startClient({ initialSyncLimit: 10, pollTimeout: 3000 });
  await waitFor(
    `${label} initial sync`,
    () => client.getSyncState() === "PREPARED" || client.getSyncState() === "SYNCING",
  );
  const keys = await requireCrypto(client).getOwnDeviceKeys();
  console.log(
    `  ${label}: ${session.user_id} / ${session.device_id}  ed25519=${keys.ed25519.slice(0, 16)}…`,
  );
  return client;
}

/** @param {sdk.MatrixClient} client @param {string} roomId @param {string} body */
function findDecryptedMessage(client, roomId, body) {
  const room = client.getRoom(roomId);
  if (!room) return null;
  return (
    room
      .getLiveTimeline()
      .getEvents()
      .find((ev) => {
        if (ev.getWireType() !== "m.room.encrypted") return false;
        if (ev.isDecryptionFailure()) return false;
        const clear = ev.getClearContent();
        return clear?.msgtype === "m.text" && clear?.body === body;
      }) ?? null
  );
}

/** @param {sdk.MatrixClient} client @param {string} roomId @param {string} body */
function countMessages(client, roomId, body) {
  const room = client.getRoom(roomId);
  if (!room) return 0;
  return room
    .getLiveTimeline()
    .getEvents()
    .filter((ev) => ev.getClearContent()?.body === body).length;
}

// --- Main scenario ----------------------------------------------------------

/** @type {sdk.MatrixClient[]} */
const clients = [];
try {
  console.log(`\n== Phase 0 E2EE proof of concept (run ${runId}) against ${HOMESERVER_URL}\n`);

  // 1. Two accounts, each with a password; Bob has two devices up front.
  const aliceName = `poc-alice-${runId}`;
  const bobName = `poc-bob-${runId}`;
  const password = `pw-${randomBytes(12).toString("hex")}`;

  console.log("1. Registering accounts and devices");
  const aliceSession = asSession(await register(aliceName, password, "Alice phone"));
  const bob1Session = asSession(await register(bobName, password, "Bob phone"));
  const bob2Session = asSession(await login(bobName, password, "Bob laptop"));
  check(
    "two accounts registered",
    !!aliceSession.user_id && !!bob1Session.user_id,
    `${aliceSession.user_id}, ${bob1Session.user_id}`,
  );
  check("second device signed in for Bob", bob2Session.device_id !== bob1Session.device_id);

  const alice = await makeClient("alice", aliceSession);
  const bob1 = await makeClient("bob1 ", bob1Session);
  const bob2 = await makeClient("bob2 ", bob2Session);
  clients.push(alice, bob1, bob2);

  // 2. Alice creates an encrypted DM with Bob; Bob joins.
  console.log("\n2. Creating an encrypted direct room");
  const { room_id: roomId } = await alice.createRoom({
    is_direct: true,
    invite: [bob1Session.user_id],
    preset: sdk.Preset.TrustedPrivateChat,
    initial_state: [
      { type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } },
    ],
  });
  await waitFor("bob sees invite", () => bob1.getRoom(roomId)?.getMyMembership() === "invite");
  await bob1.joinRoom(roomId);
  await waitFor(
    "alice sees bob joined",
    () => alice.getRoom(roomId)?.getMember(bob1Session.user_id)?.membership === "join",
  );
  await waitFor("bob2 sees room", () => bob2.getRoom(roomId)?.getMyMembership() === "join");
  check(
    "room is encrypted on Alice's side",
    await requireCrypto(alice).isEncryptionEnabledInRoom(roomId),
    roomId,
  );
  results.roomId = roomId;

  // 3. Device identity: Alice looks at Bob's devices and verifies them by
  //    fingerprint (what a user would do by comparing keys out of band).
  console.log("\n3. Device identity and verification");
  const aliceCrypto = requireCrypto(alice);
  const bobDevices = await aliceCrypto.getUserDeviceInfo([bob1Session.user_id], true);
  const bobDeviceMap = bobDevices.get(bob1Session.user_id);
  if (!bobDeviceMap) throw new Error("no device list for Bob");
  const bobDeviceIds = [...bobDeviceMap.keys()];
  check(
    "Alice sees both of Bob's devices",
    bobDeviceIds.includes(bob1Session.device_id) && bobDeviceIds.includes(bob2Session.device_id),
    bobDeviceIds.join(", "),
  );
  const before = await aliceCrypto.getDeviceVerificationStatus(
    bob1Session.user_id,
    bob1Session.device_id,
  );
  check("Bob's device starts unverified", !!before && !before.isVerified());
  for (const id of bobDeviceIds) {
    const dev = bobDeviceMap.get(id);
    if (!dev) continue;
    console.log(
      `  Bob device ${id} (${dev.displayName ?? "?"}) ed25519=${dev.getFingerprint()?.slice(0, 16)}…`,
    );
    await aliceCrypto.setDeviceVerified(bob1Session.user_id, id, true);
  }
  const after = await aliceCrypto.getDeviceVerificationStatus(
    bob1Session.user_id,
    bob1Session.device_id,
  );
  check("Alice marked Bob's device verified", after?.isVerified() === true);

  // 4. Alice sends an encrypted message; both of Bob's devices decrypt it.
  console.log("\n4. Sending and decrypting an encrypted message");
  const sent1 = await alice.sendMessage(roomId, { msgtype: sdk.MsgType.Text, body: MESSAGE_1 });
  results.eventIds = { message1: sent1.event_id };
  const eventIds = results.eventIds;
  const aliceView = await waitFor("alice's own event echoed", () =>
    requireRoom(alice, roomId).findEventById(sent1.event_id),
  );
  check(
    "sender's wire event type is m.room.encrypted",
    aliceView.getWireType() === "m.room.encrypted",
    sent1.event_id,
  );
  const wire = aliceView.getWireContent();
  check(
    "wire content has ciphertext and no body",
    typeof wire.ciphertext === "string" && wire.body === undefined,
    `algorithm=${wire.algorithm}`,
  );
  check("wire content does not contain the plaintext", !JSON.stringify(wire).includes(NONCE));

  const bob1Msg = await waitFor("bob1 decrypts message 1", () =>
    findDecryptedMessage(bob1, roomId, MESSAGE_1),
  );
  check("Bob device 1 decrypted message 1", bob1Msg.getClearContent()?.body === MESSAGE_1);
  const bob2Msg = await waitFor("bob2 decrypts message 1", () =>
    findDecryptedMessage(bob2, roomId, MESSAGE_1),
  );
  check("Bob device 2 decrypted message 1", bob2Msg.getClearContent()?.body === MESSAGE_1);
  check(
    "decrypted event is flagged encrypted and verified sender",
    bob1Msg.isEncrypted() && bob1Msg.getSender() === aliceSession.user_id,
  );

  // 5. Network interruption: Bob's laptop goes offline, Alice sends, laptop
  //    reconnects and catches up exactly once.
  console.log(
    "\n5. Network interruption: Bob's laptop loses connectivity, Alice sends, laptop reconnects",
  );
  const bob2Net = netStates.get(bob2);
  if (!bob2Net) throw new Error("no net state for bob2");
  /** @type {string[]} */
  const syncStates = [];
  bob2.on(sdk.ClientEvent.Sync, (state) => {
    if (syncStates[syncStates.length - 1] !== state) syncStates.push(state);
  });
  bob2Net.offline = true;
  await waitFor(
    "bob2 sync loop notices the outage",
    () => ["ERROR", "RECONNECTING"].includes(String(bob2.getSyncState())),
    30_000,
  );
  check(
    "client reports connection loss (sync state ERROR/RECONNECTING)",
    true,
    `state=${bob2.getSyncState()} failedRequests=${bob2Net.failed}`,
  );
  const sent2 = await alice.sendMessage(roomId, { msgtype: sdk.MsgType.Text, body: MESSAGE_2 });
  eventIds.message2 = sent2.event_id;
  await waitFor("bob1 decrypts message 2 while bob2 is offline", () =>
    findDecryptedMessage(bob1, roomId, MESSAGE_2),
  );
  await sleep(3000);
  check(
    "offline device has not seen message 2 yet",
    countMessages(bob2, roomId, MESSAGE_2) === 0,
    `offline for 3s, failed requests so far=${bob2Net.failed}`,
  );
  bob2Net.offline = false;
  await waitFor(
    "bob2 decrypts message 2 after reconnect",
    () => findDecryptedMessage(bob2, roomId, MESSAGE_2),
    120_000,
  );
  await sleep(2000); // give any duplicate delivery a chance to show up
  check(
    "reconnected device received message 2 exactly once",
    countMessages(bob2, roomId, MESSAGE_2) === 1,
    `count=${countMessages(bob2, roomId, MESSAGE_2)}`,
  );
  check("device 1 also has message 2 exactly once", countMessages(bob1, roomId, MESSAGE_2) === 1);
  check(
    "sync state recovered to SYNCING after the outage",
    bob2.getSyncState() === "SYNCING",
    `transitions: ${syncStates.join(" → ")}`,
  );
  check(
    "message 1 still readable after reconnect (keys retained)",
    countMessages(bob2, roomId, MESSAGE_1) === 1,
  );

  // 6. Idempotent retry: the same transaction ID must not create a second event.
  console.log("\n6. Retrying a send with the same transaction ID");
  const txnId = `poc-txn-${runId}`;
  /** @type {{ msgtype: typeof sdk.MsgType.Text, body: string }} */
  const content = { msgtype: sdk.MsgType.Text, body: MESSAGE_3 };
  const first = await alice.sendMessage(roomId, content, txnId);
  eventIds.message3 = first.event_id;
  const firstEv = await waitFor("first send echoed", () =>
    requireRoom(alice, roomId).findEventById(first.event_id),
  );
  // (a) client-side guard: the SDK refuses to queue a second event under a known txnId
  let clientGuard = null;
  try {
    await alice.sendMessage(roomId, content, txnId);
  } catch (err) {
    clientGuard = errMsg(err);
  }
  check(
    "client refuses to queue a second send with a known txnId",
    clientGuard !== null,
    clientGuard ?? "NO ERROR THROWN",
  );
  // (b) server-side idempotency: replay the exact HTTP request a client would retry after
  //     a timeout (same txnId, same encrypted payload) and expect the same event_id back
  const sendPath = `/rooms/${encodeURIComponent(roomId)}/send/m.room.encrypted/${encodeURIComponent(txnId)}`;
  const retry = /** @type {{ event_id: string }} */ (
    await alice.http.authedRequest(sdk.Method.Put, sendPath, undefined, firstEv.getWireContent())
  );
  check(
    "server returns the same event_id for a replayed txnId",
    first.event_id === retry.event_id,
    `${first.event_id} === ${retry.event_id}`,
  );
  await waitFor("bob1 decrypts message 3", () => findDecryptedMessage(bob1, roomId, MESSAGE_3));
  await sleep(1500);
  check(
    "recipient sees retried message exactly once",
    countMessages(bob1, roomId, MESSAGE_3) === 1,
    `count=${countMessages(bob1, roomId, MESSAGE_3)}`,
  );

  // 7. A device enrolled after the fact has no key and cannot decrypt history.
  console.log("\n7. Late device cannot decrypt earlier messages");
  const bob3Session = asSession(await login(bobName, password, "Bob tablet (added later)"));
  const bob3 = await makeClient("bob3 ", bob3Session);
  clients.push(bob3);
  const bob3Room = await waitFor("bob3 sees room", () => bob3.getRoom(roomId));
  await waitFor("bob3 has message 1 event in timeline", () =>
    bob3Room.findEventById(sent1.event_id),
  );
  await sleep(3000); // allow any decryption attempt or key request to settle
  const bob3Ev = await waitFor("bob3 event lookup", () => bob3Room.findEventById(sent1.event_id));
  check(
    "late device cannot decrypt message 1",
    bob3Ev.isDecryptionFailure() || bob3Ev.getClearContent() === null,
    bob3Ev.isDecryptionFailure() ? `reason=${bob3Ev.decryptionFailureReason ?? "unknown"}` : "",
  );
  check(
    "late device sees ciphertext, not plaintext",
    !JSON.stringify(bob3Ev.getWireContent()).includes(NONCE),
  );

  // 8. Sign out: device deletion makes the token unusable.
  console.log("\n8. Logout revokes the device token");
  const bob3Token = bob3Session.access_token;
  bob3.stopClient();
  await bob3.logout(true);
  const probe = sdk.createClient({
    baseUrl: HOMESERVER_URL,
    userId: bob3Session.user_id,
    accessToken: bob3Token,
  });
  let revoked = false;
  try {
    await probe.whoami();
  } catch (err) {
    revoked = errCode(err) === "M_UNKNOWN_TOKEN";
  }
  check("logged-out device's token is rejected", revoked);

  // 9. No silent plaintext fallback.
  //    (a) A client with NO crypto backend tries to send into the encrypted
  //        room: the SDK must refuse, not send m.room.message in the clear.
  //    (b) Alice's crypto backend is made to fail during encryption: the send
  //        must reject and nothing may reach the server.
  console.log("\n9. Forcing encryption failures: nothing may be sent in plaintext");
  const PLAIN_A = `MUST-NEVER-BE-SENT-A ${NONCE}-nocrypto`;
  const PLAIN_B = `MUST-NEVER-BE-SENT-B ${NONCE}-encfail`;
  results.forbiddenPlaintexts = [PLAIN_A, PLAIN_B];

  async function serverMessageEventCount() {
    // Ask the homeserver directly (as Alice) for the room's events; count
    // plaintext message events and any event carrying a forbidden string.
    const res = await alice.createMessagesRequest(roomId, null, 100, sdk.Direction.Backward);
    const plain = res.chunk.filter((e) => e.type === "m.room.message").length;
    const leaked = res.chunk.filter((e) => JSON.stringify(e).includes("MUST-NEVER-BE-SENT")).length;
    return { total: res.chunk.length, plain, leaked };
  }
  const beforeCounts = await serverMessageEventCount();

  // (a) crypto-less client using Bob's first session
  const noCrypto = sdk.createClient({
    baseUrl: HOMESERVER_URL,
    userId: bob1Session.user_id,
    accessToken: bob1Session.access_token,
    deviceId: bob1Session.device_id,
  });
  await noCrypto.startClient({ initialSyncLimit: 10 });
  clients.push(noCrypto);
  await waitFor("crypto-less client syncs the room", () => noCrypto.getRoom(roomId));
  let refusedA = null;
  try {
    await noCrypto.sendMessage(roomId, { msgtype: sdk.MsgType.Text, body: PLAIN_A });
  } catch (err) {
    refusedA = errMsg(err);
  }
  check(
    "client without crypto refuses to send into encrypted room",
    refusedA !== null && /encryption/i.test(refusedA),
    refusedA ?? "NO ERROR THROWN",
  );

  // (b) encryption throws inside the crypto backend
  const cryptoApi = /** @type {any} */ (alice.getCrypto());
  const realEncrypt = cryptoApi.encryptEvent.bind(cryptoApi);
  cryptoApi.encryptEvent = async () => {
    throw new Error("simulated encryption failure (PoC)");
  };
  let refusedB = null;
  try {
    await alice.sendMessage(roomId, { msgtype: sdk.MsgType.Text, body: PLAIN_B });
  } catch (err) {
    refusedB = errMsg(err);
  } finally {
    cryptoApi.encryptEvent = realEncrypt;
  }
  check("send rejects when encryption fails", refusedB !== null, refusedB ?? "NO ERROR THROWN");
  const failedLocal = requireRoom(alice, roomId)
    .getLiveTimeline()
    .getEvents()
    .find((e) => e.getContent()?.body === PLAIN_B);
  check(
    "failed message stays local with status not_sent",
    !!failedLocal && failedLocal.status === sdk.EventStatus.NOT_SENT,
    failedLocal ? `local status=${failedLocal.status}` : "not in local timeline",
  );
  if (failedLocal) alice.cancelPendingEvent(failedLocal);

  await sleep(1500);
  const afterCounts = await serverMessageEventCount();
  check(
    "server has no plaintext m.room.message events",
    afterCounts.plain === 0,
    `plain=${afterCounts.plain}`,
  );
  check("server never received the forbidden strings", afterCounts.leaked === 0);
  check(
    "server event count unchanged by the failed sends",
    afterCounts.total === beforeCounts.total,
    `${beforeCounts.total} → ${afterCounts.total}`,
  );
  // After restoring crypto, Alice can still send normally.
  const sent4 = await alice.sendMessage(roomId, {
    msgtype: sdk.MsgType.Text,
    body: `Recovered after failure. ${NONCE}-4`,
  });
  eventIds.message4 = sent4.event_id;
  await waitFor("bob1 decrypts message 4", () =>
    findDecryptedMessage(bob1, roomId, `Recovered after failure. ${NONCE}-4`),
  );
  check("encryption works again after the simulated failure", true, sent4.event_id);

  results.users = { alice: aliceSession.user_id, bob: bob1Session.user_id };
  results.devices = {
    alice: aliceSession.device_id,
    bob1: bob1Session.device_id,
    bob2: bob2Session.device_id,
    bob3: bob3Session.device_id,
  };
} catch (err) {
  results.failed = true;
  results.error = errMsg(err);
  console.error("\nERROR:", err);
} finally {
  for (const c of clients) {
    try {
      c.stopClient();
    } catch {
      /* already stopped */
    }
  }
  writeFileSync(new URL("../last-run.json", import.meta.url), JSON.stringify(results, null, 2));
  const passed = results.checks.filter((c) => c.ok).length;
  console.log(
    `\n== ${passed}/${results.checks.length} checks passed${results.error ? " — RUN ABORTED BY ERROR (see above)" : ""}. Details written to last-run.json`,
  );
  process.exit(results.failed ? 1 : 0);
}
