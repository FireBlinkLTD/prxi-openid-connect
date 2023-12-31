import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";
import { MockServer } from "./mock/MockServer";

class BaseWebhookHandlerSuite extends BaseSuite {
  private mockServer: MockServer;

  private static rejectURL = `http://localhost:${MockServer.port}/reject`;
  private static loginFailure = `http://localhost:${MockServer.port}/login-fail`;
  private static redirectToURL = `http://localhost:${MockServer.port}/redirectTo`;
  private static refreshToken = `http://localhost:${MockServer.port}/refreshToken`;
  private static logout = `http://localhost:${MockServer.port}/logout`;
  private static logoutFailure = `http://localhost:${MockServer.port}/logout-fail`;
  private static metaURL = `http://localhost:${MockServer.port}/meta`;

  public async before() {
    await this.initMockServer();
    await super.before();
  }

  public async after() {
    this.mockServer?.stop();
    this.mockServer = null;
    await super.after();
  }

  /**
   * Init mock server
   */
  private async initMockServer(): Promise<void> {
    const mocker = this.mockServer = new MockServer();

    await mocker.start();
  }

  @test()
  async rejectLogin(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: BaseWebhookHandlerSuite.rejectURL,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      const text = await this.getTextFromPage(page);

      const json = JSON.parse(text);
      // validate query to be in place
      strictEqual(
        json.http.url,
        new URL(getConfig().redirect.pageRequest.e403).pathname
      );
    });
  }

  @test()
  async rejectLoginWithoutRedirectConfig(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: BaseWebhookHandlerSuite.rejectURL,
      },
      redirect: {
        pageRequest: {
          e403: null,
        }
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      const text = await this.getTextFromPage(page);
      strictEqual(text, '403: Forbidden')
    });
  }

  @test()
  async refreshToken(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: BaseWebhookHandlerSuite.refreshToken,
      }
    });

    const uri = '/pages/test';
    await this.withNewPage(getConfig().hostURL + uri, async (page) => {
      await this.loginOnKeycloak(page);

      // navigate to the same page again
      await this.navigate(page, getConfig().hostURL + uri);
      const text = await this.getTextFromPage(page);
      const json = JSON.parse(text);
      strictEqual(json.http.url, uri);
    });
  }

  @test()
  async testRedirectTo(): Promise<void> {
    const uri = '/api/test?q=str';

    await this.reloadPrxiWith({
      webhook: {
        login: BaseWebhookHandlerSuite.redirectToURL,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      const json = await this.getJsonFromPage(page);

      // validate query to be in place
      strictEqual(json.http.url, uri);
    });
  }

  @test()
  async testLoginFailure(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: BaseWebhookHandlerSuite.loginFailure,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      const text = await this.getTextFromPage(page);
      strictEqual(text, '500: Unexpected error occurred')
    });
  }

  @test()
  async testLoginFailureWithE500Redirect(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: BaseWebhookHandlerSuite.loginFailure,
      },
      redirect: {
        pageRequest: {
          e500: '/api/test'
        }
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      const url = page.url();
      strictEqual(url, getConfig().hostURL + '/api/test');
    });
  }

  @test()
  async testMeta(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: BaseWebhookHandlerSuite.metaURL,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      const text = await this.getTextFromPage(page);

      const json = JSON.parse(text);
      // validate query to be in place
      strictEqual(
        json.headers[getConfig().headers.meta],
        JSON.stringify({
          bool: true,
          str: 'string',
        })
      );
    });
  }

  @test()
  async logoutEndpoint(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: BaseWebhookHandlerSuite.metaURL,
        logout: BaseWebhookHandlerSuite.logout,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      const uri = '/api/test';
      await this.navigate(page, getConfig().hostURL + uri);
      await this.wait(200);
      await this.getJsonFromPage(page);

      // logout
      await this.logout(page);

      await this.navigate(page, getConfig().hostURL + uri);
      await this.wait(200);
      const text = await this.getTextFromPage(page);
      strictEqual(text, '401: Unauthorized')
    });
  }

  @test()
  async logoutFailEndpoint(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        logout: BaseWebhookHandlerSuite.logoutFailure,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      const uri = '/api/test';
      await this.navigate(page, getConfig().hostURL + uri);
      await this.wait(200);
      await this.getJsonFromPage(page);

      // logout
      await this.logout(page);

      await this.navigate(page, getConfig().hostURL + uri);
      await this.wait(200);
      const text = await this.getTextFromPage(page);
      strictEqual(text, '401: Unauthorized')
    });
  }
}

@suite()
class HttpWebhookHandlerSuite extends BaseWebhookHandlerSuite {
  constructor() {
    super('HTTP', false);
  }
}

@suite()
class HttpsWebhookHandlerSuite extends BaseWebhookHandlerSuite {
  constructor() {
    super('HTTP', true);
  }
}

@suite()
class Http2WebhookHandlerSuite extends BaseWebhookHandlerSuite {
  constructor() {
    super('HTTP2', true);
  }
}
