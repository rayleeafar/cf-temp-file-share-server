import {
  MAX_SIZE,
  MAX_EXPIRY,
  MAX_COLLISION_RETRIES,
  getNamespace,
  generateShortCode,
} from "../../_utils.js";

export async function onRequest(context) {
  const request = context.request;
  const bucket = context.env.TEMP_FILES_BUCKET;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { filename, type, expiresIn, authToken, fileKey, fileSize } = body;

  // Validate size if provided
  if (fileSize && fileSize > MAX_SIZE) {
    return new Response(JSON.stringify({ error: "File exceeds the 1 GB size limit." }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }

  let key;
  let metadata = {
    httpMetadata: { contentType: type || "application/octet-stream" },
    customMetadata: {},
  };

  const effectiveToken = authToken !== null && authToken !== undefined && authToken !== "" ? authToken : null;

  if (fileKey) {
    // This is an update to an existing file
    const existing = await bucket.head(fileKey);
    if (!existing) {
      return new Response(JSON.stringify({ error: "File not found." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Verify auth token matches
    const storedToken = existing.customMetadata?.authToken;
    if (!storedToken || storedToken !== effectiveToken) {
      return new Response(JSON.stringify({ error: "Invalid or missing auth token" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    key = fileKey;
    metadata.customMetadata = { ...existing.customMetadata };
    metadata.httpMetadata.contentType = type || existing.httpMetadata?.contentType || "application/octet-stream";
    if (filename) {
      metadata.customMetadata.filename = filename;
    }
  } else {
    // New file upload
    const namespace = getNamespace(effectiveToken);

    // Generate short code with collision retry
    let code;
    for (let attempt = 0; attempt <= MAX_COLLISION_RETRIES; attempt++) {
      code = generateShortCode();
      key = `${namespace}/${code}`;
      const existing = await bucket.head(key);
      if (!existing) break;
    }

    metadata.customMetadata = {
      filename: filename || "unnamed",
    };
    if (effectiveToken !== null) {
      metadata.customMetadata.authToken = effectiveToken;
    }
  }

  // Expiration update / set
  if (expiresIn !== null && expiresIn !== undefined) {
    if (expiresIn === "") {
      delete metadata.customMetadata.expires;
    } else {
      const seconds = Math.min(parseInt(expiresIn, 10), MAX_EXPIRY);
      if (!isNaN(seconds) && seconds > 0) {
        const expiresAt = Math.floor(Date.now() / 1000) + seconds;
        metadata.customMetadata.expires = String(expiresAt);
      }
    }
  }

  try {
    const upload = await bucket.createMultipartUpload(key, metadata);
    const url = new URL(request.url);
    const downloadUrl = `${url.origin}/${key}`;

    const responseBody = {
      uploadId: upload.uploadId,
      key,
      url: downloadUrl,
    };

    const expiresAtStr = metadata.customMetadata.expires;
    if (expiresAtStr) {
      responseBody.expiresAt = parseInt(expiresAtStr, 10);
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Failed to initiate upload." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
