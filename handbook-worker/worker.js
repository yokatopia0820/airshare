export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    if (url.pathname === "/") {
      return Response.redirect(`${url.origin}/index.html`, 302);
    }

    return new Response("Not found", { status: 404 });
  },
};
