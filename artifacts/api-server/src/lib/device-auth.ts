import { randomBytes, timingSafeEqual } from "node:crypto";
import { hashToken } from "./tokens";

export function issueDeviceToken(): string {
  return `movegps_${randomBytes(32).toString("base64url")}`;
}

export function verifyDeviceToken(rawToken: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(rawToken), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function readDeviceAuthorization(header: string | undefined): string | null {
  const match = /^Device\s+([^\s]+)$/i.exec(header?.trim() ?? "");
  return match?.[1] ?? null;
}
