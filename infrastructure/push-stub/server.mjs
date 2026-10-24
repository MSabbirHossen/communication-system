// Development push gateway stub (ADR-0006, THREAT_MODEL TM-12). Implements the Matrix
// Push Gateway API's notify endpoint so the homeserver's pushes can be inspected: every
// notification is recorded and checked for fields that must never leave the server for a
// content-free (`event_id_only`) pusher. No real delivery happens here; Sygnal with FCM/APNs
// credentials replaces this stub outside development.
//
//   POST   /_matrix/push/v1/notify   record a push (always 200 so the server does not retry)
//   GET    /notifications            recorded pushes, newest last, with any violations
//   DELETE /notifications            clear the record
//   GET    /health
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8010);
/** Fields a content-free notification must not carry (spec: Push Gateway API, event_id_only). */
const FORBIDDEN = [
  "content",
  "sender",
  "sender_display_name",
  "room_name",
  "room_alias",
  "type",
  "membership",
];

/** @type {Array<{ receivedAt: string; notification: Record<string, unknown>; violations: string[] }>} */
const records = [];

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  try {
    if (req.method === "POST" && url.pathname === "/_matrix/push/v1/notify") {
      const body = await readJson(req);
      const notification =
        body && typeof body.notification === "object" && body.notification ? body.notification : {};
      const violations = FORBIDDEN.filter((k) => k in notification);
      const record = { receivedAt: new Date().toISOString(), notification, violations };
      records.push(record);
      console.log(
        `push-stub: notify room=${String(notification.room_id ?? "?")} event=${String(notification.event_id ?? "?")} keys=${Object.keys(notification).join(",")}${violations.length ? ` VIOLATIONS=${violations.join(",")}` : ""}`,
      );
      return send(res, 200, { rejected: [] });
    }
    if (req.method === "GET" && url.pathname === "/notifications") return send(res, 200, records);
    if (req.method === "DELETE" && url.pathname === "/notifications") {
      records.length = 0;
      return send(res, 200, { cleared: true });
    }
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
    return send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(`push-stub: ${e instanceof Error ? e.message : String(e)}`);
    return send(res, 400, { error: "bad request" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`push-stub: listening on ${PORT}; forbidden fields: ${FORBIDDEN.join(", ")}`);
});
