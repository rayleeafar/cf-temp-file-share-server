const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAX_COLLISION_RETRIES = 3;

function fnv1a(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getNamespace(authToken) {
  if (authToken) {
    const hash = fnv1a(authToken);
    return String((hash % 9000) + 1000);
  }
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = bytes[0] * 16777216 + bytes[1] * 65536 + bytes[2] * 256 + bytes[3];
  return String(1000 + (value % 9000));
}

function generateShortCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += BASE62_ALPHABET[bytes[i] % 62];
  }
  return code;
}

export async function onRequest(context) {
  const request = context.request;
  const bucket = context.env.TEMP_FILES_BUCKET;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Check content-length header before reading body
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_SIZE) {
    return new Response(JSON.stringify({ error: "File exceeds the 100 MB size limit." }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const expiresIn = formData.get("expiresIn");
  const authToken = formData.get("authToken");

  if (!file || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: "No file provided." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (file.size > MAX_SIZE) {
    return new Response(JSON.stringify({ error: "File exceeds the 100 MB size limit." }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }

  const fileBuffer = await file.arrayBuffer();

  const metadata = {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { filename: file.name || "unnamed" },
  };

  let expiresAt = null;
  if (expiresIn !== null && expiresIn !== undefined && expiresIn !== "") {
    const seconds = Math.min(parseInt(expiresIn, 10), MAX_EXPIRY);
    expiresAt = Math.floor(Date.now() / 1000) + seconds;
    metadata.customMetadata.expires = String(expiresAt);
  }

  const effectiveToken =
    authToken !== null && authToken !== undefined && authToken !== "" ? authToken : null;

  if (effectiveToken !== null) {
    metadata.customMetadata.authToken = effectiveToken;
  }

  const namespace = getNamespace(effectiveToken);

  // Generate short code with collision retry
  let code;
  let key;
  for (let attempt = 0; attempt <= MAX_COLLISION_RETRIES; attempt++) {
    code = generateShortCode();
    key = `${namespace}/${code}`;
    const existing = await bucket.head(key);
    if (!existing) break;
  }

  await bucket.put(key, fileBuffer, metadata);

  const url = new URL(request.url);
  const downloadUrl = `${url.origin}/${namespace}/${code}`;

  const responseBody = { url: downloadUrl, id: key };
  if (expiresAt) {
    responseBody.expiresAt = expiresAt;
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
