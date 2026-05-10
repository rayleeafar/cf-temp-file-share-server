export async function onRequest(context) {
  const request = context.request;
  const bucket = context.env.TEMP_FILES_BUCKET;

  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(JSON.stringify({ error: "token query parameter is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const allObjects = [];
  let cursor = undefined;

  do {
    const result = await bucket.list({
      include: ["customMetadata", "httpMetadata"],
      cursor: cursor,
    });
    allObjects.push(...result.objects);
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  const matched = [];

  for (const object of allObjects) {
    if (object.customMetadata?.authToken !== token) {
      continue;
    }

    const expires = object.customMetadata?.expires;
    if (expires) {
      const expiresTimestamp = parseInt(expires, 10);
      if (now > expiresTimestamp) {
        continue;
      }
    }

    const key = object.key;
    const hasSlash = key.indexOf("/") !== -1;
    const fileUrl = hasSlash
      ? `${url.origin}/${key}`
      : `${url.origin}/api/files/${key}`;

    matched.push({
      id: key,
      filename: object.customMetadata?.filename || key,
      size: object.size,
      type: object.httpMetadata?.contentType || "application/octet-stream",
      expiresAt: expires ? parseInt(expires, 10) : null,
      url: fileUrl,
    });
  }

  return new Response(JSON.stringify({ files: matched }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
