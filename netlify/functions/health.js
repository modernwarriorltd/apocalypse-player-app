exports.handler = async () => ({
  statusCode: 200,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store"
  },
  body: JSON.stringify({ ok: true, function: "health" })
});
