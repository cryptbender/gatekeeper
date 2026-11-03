// Mimics Supabase's gateway: /rest/v1/* -> PostgREST (which serves at the root).
import http from "node:http";
http.createServer((req, res) => {
  const url = req.url.replace(/^\/rest\/v1/, "") || "/";
  const p = http.request({ host: "127.0.0.1", port: 3000, path: url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  p.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(p);
}).listen(54321, () => console.log("gateway on 54321"));
