import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { deepEqual, strictEqual } from "assert";
import { sign } from "jsonwebtoken";
import { MockServer } from "./mock/MockServer";

abstract class BaseWhoamiAPIHandlerSuite extends BaseSuite {
  private static metaURL = `http://localhost:${MockServer.port}/meta`;
  private mockServer: MockServer;

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
  async authorized() {
    await this.withNewAuthenticatedPage(getConfig().hostURL + getConfig().paths.api.whoami, async (page) => {
      const json = await this.getJsonFromPage(page);
      this.sortNestedArrays(json);

      deepEqual(json, {
        anonymous: false,
        claims: {
          auth: {
            account: [
              'manage-account',
              'manage-account-links',
              'view-profile',
            ].sort(),
            realm: [
              'default-roles-test',
              'offline_access',
              'uma_authorization',
              'test_role',
            ].sort(),
          },
          proxy: {
            realmRoles: [
              'default-roles-test',
              'offline_access',
              'uma_authorization',
              'test_role',
            ].sort(),
            'username': 'test',
          },
        },
      });
    });
  }

  @test()
  async authorizedWithMeta() {
    await this.reloadPrxiWith({
      webhook: {
        login: BaseWhoamiAPIHandlerSuite.metaURL,
      }
    });

    await this.withNewPage(getConfig().hostURL + getConfig().paths.login, async (page) => {
      await this.loginOnKeycloak(page);

      // make sure we can access the resource
      await this.navigate(page, getConfig().hostURL + getConfig().paths.api.whoami);
      const json = await this.getJsonFromPage(page);
      this.sortNestedArrays(json);

      deepEqual(json, {
        anonymous: false,
        claims: {
          auth: {
            account: [
              'manage-account',
              'manage-account-links',
              'view-profile',
            ].sort(),
            realm: [
              'default-roles-test',
              'offline_access',
              'uma_authorization',
              'test_role',
            ].sort(),
          },
          proxy: {
            realmRoles: [
              'default-roles-test',
              'offline_access',
              'uma_authorization',
              'test_role',
            ].sort(),
            'username': 'test',
          },
        },
        meta: {
          bool: true,
          str: 'string',
        },
      });
    });
  }

  @test()
  async invalidAuth() {
    await this.withNewPage(getConfig().hostURL + getConfig().paths.api.whoami, async (page) => {
      await page.setCookie(
        {
          name: getConfig().cookies.names.accessToken,
          value: sign({}, 'test')
        }
      );
      await page.deleteCookie(
        { name: getConfig().cookies.names.idToken },
        { name: getConfig().cookies.names.refreshToken },
      )
      await this.navigate(page, getConfig().hostURL + getConfig().paths.api.whoami);

      const text = await this.getTextFromPage(page);

      // validate query to be in place
      strictEqual(text, '401: Unauthorized');
    });
  }

  @test()
  async anonymous() {
    await this.withNewPage(getConfig().hostURL + getConfig().paths.api.whoami, async (page) => {
      const json = await this.getJsonFromPage(page);
      this.sortNestedArrays(json);

      deepEqual(json, {
        anonymous: true,
        claims: {
          auth: {
            account: [],
            realm: [],
          },
          proxy: {},
        },
      });
    });
  }
}

@suite()
class HttpWhoamiAPIHandlerSuite extends BaseWhoamiAPIHandlerSuite{
  constructor() {
    super('HTTP', false);
  }
}

@suite()
class HttpsWhoamiAPIHandlerSuite extends BaseWhoamiAPIHandlerSuite{
  constructor() {
    super('HTTP', true);
  }
}

@suite()
class Http2WhoamiAPIHandlerSuite extends BaseWhoamiAPIHandlerSuite{
  constructor() {
    super('HTTP2', true);
  }
}
