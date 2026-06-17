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

  const { key, uploadId, parts } = body;

  if (!key || !uploadId || !parts || !Array.isArray(parts)) {
    return new Response(JSON.stringify({ error: "Missing required fields: key, uploadId, parts" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Sort parts by partNumber as S3 / R2 require them in sorted order
  const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

  try {
    const upload = bucket.resumeMultipartUpload(key, uploadId);
    await upload.complete(sortedParts);

    // Retrieve head to verify and fetch metadata for the response
    const fileObject = await bucket.head(key);
    if (!fileObject) {
      return new Response(JSON.stringify({ error: "Uploaded file not found in storage." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const downloadUrl = `${url.origin}/${key}`;

    const responseBody = {
      url: downloadUrl,
      id: key,
    };

    const expiresAtStr = fileObject.customMetadata?.expires;
    if (expiresAtStr) {
      responseBody.expiresAt = parseInt(expiresAtStr, 10);
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Failed to complete upload." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
