import {
  MAX_SIZE,
  MAX_EXPIRY,
  MAX_COLLISION_RETRIES,
  getNamespace,
  generateShortCode,
} from "../_utils.js";

export async function onRequest(context) {
  const request = context.request;
  const bucket = context.env.TEMP_FILES_BUCKET;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Check content-length header before reading body
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_SIZE) {
    return new Response(JSON.stringify({ error: "File exceeds the 1 GB size limit." }), {
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
    return new Response(JSON.stringify({ error: "File exceeds the 1 GB size limit." }), {
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
