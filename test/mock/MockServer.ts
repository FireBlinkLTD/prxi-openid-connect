import { IncomingMessage, Server, ServerResponse, createServer } from "node:http";
import { mappings } from "./mappings";

export class MockServer {
  public static port = 7777;
  private server: Server;

  /**
   * Start server
   */
  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      this.requestHandler(req, res);
    });

    await new Promise<void>(res => {
      this.server.listen(MockServer.port, () => {
        res();
      })
    });
  }

  /**
   * Stop server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Request handler
   * @param req
   * @param res
   * @returns
   */
  private requestHandler(req: IncomingMessage, res: ServerResponse): void {
    const { method, url } = req;
    const path = url.split('?')[0];

    for (const mapping of mappings) {
      if (mapping.path.toLowerCase() === path.toLowerCase() && mapping.method.toLowerCase() === method.toLowerCase()) {
        if (mapping.headers) {
          for (const header of Object.keys(mapping.headers)) {
            res.setHeader(header, mapping.headers[header]);
          }
        }

        res.setHeader('Content-Length', mapping.response.length);

        res.statusCode = mapping.status;
        res.write(mapping.response, () => {
          res.end();
        });

        return;
      }
    }

    res.statusCode = 404;
    res.end();
  }
}
