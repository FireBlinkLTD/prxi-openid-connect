import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";
import { start } from "../src/Server";
import { prepareMapping } from "../src/config/Mapping";
import {io} from 'socket.io-client';
import { serialize } from "cookie";

class BaseWebSocketSuite extends BaseSuite {
  @test()
  async publicEndpointWithoutAuth() {
    await this.test(false, false);
  }

  @test()
  async publicEndpointWithoutAuthAndAdditionalHeaders() {
    await this.test(false, true);
  }

  @test()
  async publicEndpointWithAuth() {
    await this.test(true, false);
  }

  @test()
  async publicEndpointWithAuthAndAdditionalHeaders() {
    await this.test(true, true);
  }

  /**
   * Restart to use new host
   * @param secure - if true /.ws will require authentication
   * @param additionalHeaders
   */
  private async prepare(secure: boolean, additionalHeaders: boolean): Promise<void> {
    // use another host
    //getConfig().upstream = 'http://localhost:4444';

    if (secure) {
      getConfig().mappings.pages.push(
        prepareMapping({
          pattern: '/socket.io',
          auth: {
            claims: {
              realm: [
                'test_role'
              ]
            }
          }
        })
      );
    } else {
      getConfig().mappings.public.push(
        prepareMapping({
          pattern: '/socket.io'
        })
      );
    }

    if (additionalHeaders) {
      getConfig().headers.claims.auth.all = 'X-ALL-CLAIMS';
      getConfig().headers.claims.auth.matching = 'X-MATCHING-CLAIMS';
    }

    await this.prxi.stop(true);
    this.prxi = await start(true);
  }

  /**
   * Run test flow
   * @param withAuth
   * @param additionalHeaders
   */
  private async test(withAuth: boolean, additionalHeaders: boolean): Promise<void> {
    await this.prepare(withAuth, additionalHeaders);

    const uri = '/socket.io';
    await this.withNewPage(getConfig().hostURL + uri, async (page) => {
      if (withAuth) {
        await this.loginOnKeycloak(page);
      }

      const cookies = await page.cookies();
      const sio = io(getConfig().hostURL, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: {
          cookie: cookies.map(c => serialize(c.name, c.value)).join('; '),
        }
      });

      const send = 'test';
      let received = null;
      await new Promise<void>((res, rej) => {
        const timeout = setTimeout(() => {
          sio.disconnect();
          rej(new Error('Unable to connect to WS'));
        }, 2000);

        sio.once('connect_error', (err) => {
          console.error('connection error', err);
        });

        sio.once('connect', () => {
          sio.on('echo', (msg: string) => {
            received = msg;
            sio.disconnect();
            clearTimeout(timeout);
            res();
          });
          sio.emit('echo', send);
        });
      });
      sio.disconnect();

      strictEqual(received, send);
    });
  }
}

@suite()
class HttpWebSocketSuite extends BaseWebSocketSuite {
  constructor() {
    super('HTTP', false);
  }
}

@suite()
class HttpsWebSocketSuite extends BaseWebSocketSuite {
  constructor() {
    super('HTTP', true);
  }
}

@suite()
class Http2WebSocketSuite extends BaseWebSocketSuite {
  constructor() {
    super('HTTP2', true);
  }
}
