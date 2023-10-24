import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";

const OpenApiMocker = require('open-api-mocker');

@suite()
class PublicMappingSuite extends BaseSuite {
  private mockServer: any;

  private static mockPort = 7777;
  private static rejectURL = `http://localhost:${PublicMappingSuite.mockPort}/reject`;
  private static metaURL = `http://localhost:${PublicMappingSuite.mockPort}/meta`;

  public async before() {
    await this.initMockServer();
    await super.before();
  }

  public async after() {
    this.mockServer?.shutdown();
    this.mockServer = null;
    await super.after();
  }

  /**
   * Init mock server
   */
  private async initMockServer(): Promise<void> {
    const mocker = this.mockServer = new OpenApiMocker({
      port: PublicMappingSuite.mockPort,
      schema: 'test/assets/webhook/mock.yml',
    });

    await mocker.validate();
    await mocker.mock();
  }

  @test()
  async rejectLogin(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: PublicMappingSuite.rejectURL,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      const text = await this.getTextFromPage(page);

      const json = JSON.parse(text);
      // validate query to be in place
      strictEqual(
        json.http.originalUrl,
        new URL(getConfig().redirect.pageRequest.e403).pathname
      );
    });
  }

  @test()
  async testMeta(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: PublicMappingSuite.metaURL,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      const text = await this.getTextFromPage(page);

      const json = JSON.parse(text);
      // validate query to be in place
      strictEqual(
        json.request.headers[getConfig().headers.meta],
        JSON.stringify({
          bool: true,
          str: 'string',
        })
      );
    });
  }
}
