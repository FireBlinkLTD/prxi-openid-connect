import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";
import { start } from "../src/Server";
import { prepareMapping } from "../src/config/Mapping";

@suite()
class WebSocketSuite extends BaseSuite {
  private static SELECTOR_TEXTAREA = '#content';
  private static SELECTOR_SUBMIT = '#send';
  private static SELECTOR_DISCONNECT = '#disconnect';

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
    getConfig().upstream = 'http://localhost:4444';

    if (secure) {
      getConfig().mappings.pages.push(
        prepareMapping({
          pattern: '/.ws',
          claims: {
            realm: [
              'test_role'
            ]
          }
        }, false)
      );
    } else {
      getConfig().mappings.public.push(
        prepareMapping({
          pattern: '/.ws'
        }, false)
      );
    }

    if (additionalHeaders) {
      getConfig().headers.claims.auth.all = 'X-ALL-CLAIMS';
      getConfig().headers.claims.auth.matching = 'X-MATCHING-CLAIMS';
    }

    await this.prxi.stop();
    this.prxi = await start();
  }

  /**
   * Run test flow
   * @param withAuth
   * @param additionalHeaders
   */
  private async test(withAuth: boolean, additionalHeaders: boolean): Promise<void> {
    await this.prepare(withAuth, additionalHeaders);

    const uri = '/.ws';
    await this.withNewPage(getConfig().hostURL + uri, async (page) => {
      if (withAuth) {
        await this.loginOnKeycloak(page);
      }

      const msg = 'HELLO';

      // send message
      console.log('-> WS: send message');
      await page.type(WebSocketSuite.SELECTOR_TEXTAREA, msg);
      await page.click(WebSocketSuite.SELECTOR_SUBMIT);

      // disconnect
      console.log('-> WS: disconnect');
      await this.wait(20);
      await page.click(WebSocketSuite.SELECTOR_DISCONNECT);

      console.log('-> WS: get console state');
      const consoleState = <string>(await page.evaluate(() => document.querySelector('#console').innerHTML));

      // should appear twice, as [send] and [recv]
      const messageMatchesCount = (consoleState.match(new RegExp(msg, 'g')) || []).length;
      strictEqual(messageMatchesCount, 2);
    });
  }
}
