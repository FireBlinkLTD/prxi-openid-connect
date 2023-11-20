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
  private static loginFailure = `http://localhost:${PublicMappingSuite.mockPort}/login-fail`;
  private static redirectToURL = `http://localhost:${PublicMappingSuite.mockPort}/redirectTo`;
  private static refreshToken = `http://localhost:${PublicMappingSuite.mockPort}/refreshToken`;
  private static logout = `http://localhost:${PublicMappingSuite.mockPort}/logout`;
  private static logoutFailure = `http://localhost:${PublicMappingSuite.mockPort}/logout-fail`;
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
  async rejectLoginWithoutRedirectConfig(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: PublicMappingSuite.rejectURL,
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
        login: PublicMappingSuite.refreshToken,
      }
    });

    const uri = '/pages/test';
    await this.withNewPage(getConfig().hostURL + uri, async (page) => {
      await this.loginOnKeycloak(page);

      // navigate to the same page again
      await this.navigate(page, getConfig().hostURL + uri);
      const text = await this.getTextFromPage(page);
      const json = JSON.parse(text);
      strictEqual(json.http.originalUrl, uri);
    });
  }

  @test()
  async testRedirectTo(): Promise<void> {
    const uri = '/api/test?q=str';

    await this.reloadPrxiWith({
      webhook: {
        login: PublicMappingSuite.redirectToURL,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      const json = await this.getJsonFromPage(page);

      // validate query to be in place
      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');
    });
  }

  @test()
  async testLoginFailure(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: PublicMappingSuite.loginFailure,
      }
    });

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      const text = await this.getTextFromPage(page);
      strictEqual(text, '500: Unexpected error occurred')
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

  @test()
  async logoutEndpoint(): Promise<void> {
    await this.reloadPrxiWith({
      webhook: {
        login: PublicMappingSuite.metaURL,
        logout: PublicMappingSuite.logout,
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
        logout: PublicMappingSuite.logoutFailure,
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
