export async function onRequest(context) {
  const request = context.request;
  const bucket = context.env.TEMP_FILES_BUCKET;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const partNumberStr = url.searchParams.get("partNumber");

  if (!key || !uploadId || !partNumberStr) {
    return new Response(JSON.stringify({ error: "Missing required query parameters: key, uploadId, partNumber" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const partNumber = parseInt(partNumberStr, 10);
  if (isNaN(partNumber) || partNumber < 1 || partNumber > 10000) {
    return new Response(JSON.stringify({ error: "Invalid partNumber. Must be between 1 and 10000." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let chunkBuffer;
  try {
    chunkBuffer = await request.arrayBuffer();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to read request body." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (chunkBuffer.byteLength === 0) {
    return new Response(JSON.stringify({ error: "Empty part content." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const upload = bucket.resumeMultipartUpload(key, uploadId);
    const uploadedPart = await upload.uploadPart(partNumber, chunkBuffer);

    return new Response(JSON.stringify({
      partNumber: uploadedPart.partNumber,
      etag: uploadedPart.etag,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Failed to upload part." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
