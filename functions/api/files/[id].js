export async function onRequest(context) {
  const request = context.request;
  const bucket = context.env.TEMP_FILES_BUCKET;
  const id = context.params.id;

  if (!id) {
    return new Response("Not found", { status: 404 });
  }

  const object = await bucket.get(id);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const expires = object.customMetadata?.expires;

  if (expires) {
    const expiresTimestamp = parseInt(expires, 10);
    if (Date.now() / 1000 > expiresTimestamp) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Expired</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <h1>Link Expired</h1>
    <p>This file is no longer available. The link has expired.</p>
    <a href="/" class="upload-btn" style="display:inline-block;text-align:center;text-decoration:none;margin-top:1rem">Upload a new file</a>
  </div>
</body>
</html>`;
      return new Response(html, {
        status: 410,
        headers: { "content-type": "text/html" },
      });
    }
  }

  const filename = object.customMetadata?.filename || object.key;

  const headers = {
    "content-type": object.httpMetadata?.contentType || "application/octet-stream",
    "content-disposition": `attachment; filename="${filename}"`,
    "content-length": object.size,
  };

  return new Response(object.body, { headers });
}
