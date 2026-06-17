export const MAX_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB
export const MAX_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
export const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const MAX_COLLISION_RETRIES = 3;

export function fnv1a(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getNamespace(authToken) {
  if (authToken) {
    const hash = fnv1a(authToken);
    return String((hash % 9000) + 1000);
  }
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = bytes[0] * 16777216 + bytes[1] * 65536 + bytes[2] * 256 + bytes[3];
  return String(1000 + (value % 9000));
}

export function generateShortCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += BASE62_ALPHABET[bytes[i] % 62];
  }
  return code;
}
