/**
 * Client-generated id for a status change. Sending the same id again (a retry
 * after a dropped connection) is applied only once by the server.
 *
 * crypto.randomUUID only exists on HTTPS/localhost, so a device opening the dev
 * server by LAN IP over plain HTTP falls back to getRandomValues (available everywhere).
 */
export function newChangeId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
