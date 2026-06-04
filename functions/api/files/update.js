const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

export async function onRequest(context) {
  const request = context.request;
  const bucket = context.env.TEMP_FILES_BUCKET;

  if (request.method !== "PUT") {
    return new Response("Method not allowed", { status: 405 });
  }

  const formData = await request.formData();
  const fileKey = formData.get("fileKey");
  const authToken = formData.get("authToken");
  const newFile = formData.get("file");
  const expiresIn = formData.get("expiresIn");

  // Validate required fields
  if (!fileKey || !authToken) {
    return new Response(
      JSON.stringify({ error: "fileKey and authToken are required." }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Check if the object exists
  const existing = await bucket.head(fileKey);
  if (!existing) {
    return new Response(
      JSON.stringify({ error: "File not found." }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Verify auth token matches
  const storedToken = existing.customMetadata?.authToken;
  if (!storedToken || storedToken !== authToken) {
    return new Response(
      JSON.stringify({ error: "Invalid or missing auth token" }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Build updated metadata from existing
  const metadata = {
    httpMetadata: {
      contentType:
        existing.httpMetadata?.contentType || "application/octet-stream",
    },
    customMetadata: { ...existing.customMetadata },
  };

  let fileBuffer = null;

  // If a new file is provided, validate and use it
  if (newFile && newFile instanceof File) {
    if (newFile.size > MAX_SIZE) {
      return new Response(
        JSON.stringify({ error: "File exceeds the 25 MB size limit." }),
        {
          status: 413,
          headers: { "content-type": "application/json" },
        }
      );
    }
    fileBuffer = await newFile.arrayBuffer();
    metadata.httpMetadata.contentType =
      newFile.type || "application/octet-stream";
    metadata.customMetadata.filename = newFile.name || "unnamed";
  }

  // Handle expiration update
  if (expiresIn !== null && expiresIn !== undefined) {
    if (expiresIn === "") {
      // Make permanent — remove expires metadata
      delete metadata.customMetadata.expires;
    } else {
      const seconds = parseInt(expiresIn, 10);
      if (!isNaN(seconds) && seconds > 0) {
        const expiresAt = Math.floor(Date.now() / 1000) + seconds;
        metadata.customMetadata.expires = String(expiresAt);
      }
    }
  }

  // Determine what to write
  if (fileBuffer !== null) {
    // Replace file content with new data
    await bucket.put(fileKey, fileBuffer, metadata);
  } else {
    // Only updating metadata — need to re-upload existing content
    // We need the existing body; head() doesn't return body, so get() it
    const existingObject = await bucket.get(fileKey);
    if (!existingObject) {
      return new Response(
        JSON.stringify({ error: "File not found." }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        }
      );
    }
    const existingBody = await existingObject.arrayBuffer();
    await bucket.put(fileKey, existingBody, metadata);
  }

  const url = new URL(request.url);
  const downloadUrl = `${url.origin}/${fileKey}`;

  const responseBody = { url: downloadUrl, id: fileKey };
  const updatedExpires = metadata.customMetadata.expires;
  if (updatedExpires) {
    responseBody.expiresAt = parseInt(updatedExpires, 10);
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
