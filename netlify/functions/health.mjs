export default async () =>
  new Response(JSON.stringify({ ok: true, function: "health" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
