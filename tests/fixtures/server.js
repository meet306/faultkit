/**
 * @file Local HTTP server fixture for testing unintercepted passthroughs.
 */

import http from "node:http";

/**
 * Creates and starts a lightweight local HTTP server for testing.
 * @returns {Promise<{ server: http.Server, port: number, url: string, close: () => Promise<void> }>}
 */
export function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/hello") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Hello from local fixture!" }));
      } else if (req.url === "/echo-headers") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(req.headers));
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const url = `http://127.0.0.1:${port}`;

      resolve({
        server,
        port,
        url,
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          })
      });
    });
  });
}
