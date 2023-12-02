import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { deepEqual, ok, strictEqual } from "assert";

@suite()
class ApiMappingSuite extends BaseSuite {
  @test()
  async passIn() {
    const uri = '/api/test?q=str';

    // add configuration for additional headers
    getConfig().headers.claims.auth.all = 'X-ALL-CLAIMS';
    getConfig().headers.claims.auth.matching = 'X-MATCHING-CLAIMS';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);

      // validate query to be in place
      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');
      deepEqual(JSON.parse(json.request.headers['x-matching-claims']).realm, ["test_role"]);
      deepEqual(JSON.parse(json.request.headers['x-all-claims']).realm.sort(), ["default-roles-test","offline_access","test_role","uma_authorization"]);

      // validate cookies
      ok(json.request.cookies[getConfig().cookies.names.accessToken]);
      ok(json.request.cookies[getConfig().cookies.names.idToken]);
      ok(json.request.cookies[getConfig().cookies.names.refreshToken]);
      ok(!json.request.cookies[getConfig().cookies.names.originalPath]);

      // validate proxy claims
      const proxyClaims = JSON.parse(json.request.headers[getConfig().headers.claims.proxy]);
      strictEqual(proxyClaims.username, 'test');
      ok(proxyClaims.realmRoles.indexOf('test_role') >= 0);
    });
  }

  @test()
  async removePrxiCookies() {
    const uri = '/api/test?q=str';

    // add configuration for additional headers
    getConfig().cookies.proxyToUpstream = false;

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      await page.setCookie(
        {
          name: 'test1',
          value: 'test1value',
        },
        {
          name: 'test2',
          value: 'test2value',
        }
      )
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);

      // validate query to be in place
      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');

      // validate cookies
      ok(!json.request.cookies[getConfig().cookies.names.accessToken]);
      ok(!json.request.cookies[getConfig().cookies.names.idToken]);
      ok(!json.request.cookies[getConfig().cookies.names.refreshToken]);
      ok(!json.request.cookies[getConfig().cookies.names.meta]);
      ok(!json.request.cookies[getConfig().cookies.names.originalPath]);

      strictEqual(json.request.cookies.test1, 'test1value');
      strictEqual(json.request.cookies.test2, 'test2value');
    });
  }

  @test()
  async removeAllCookies() {
    const uri = '/api/test?q=str';

    // add configuration for additional headers
    getConfig().cookies.proxyToUpstream = false;
    getConfig().headers.request = {
      'Cookie': null,
    }

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      await page.setCookie(
        {
          name: 'test1',
          value: 'test1value',
        },
        {
          name: 'test2',
          value: 'test2value',
        }
      )
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);

      // validate query to be in place
      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');

      // validate cookies
      ok(!json.request.cookies[getConfig().cookies.names.accessToken]);
      ok(!json.request.cookies[getConfig().cookies.names.idToken]);
      ok(!json.request.cookies[getConfig().cookies.names.refreshToken]);
      ok(!json.request.cookies[getConfig().cookies.names.meta]);
      ok(!json.request.cookies[getConfig().cookies.names.originalPath]);
      ok(!json.request.cookies.test1);
      ok(!json.request.cookies.test2);
    });
  }

  @test()
  async e401() {
    const uri = '/api/test?q=str';
    const result = await this.fetch(getConfig().hostURL + uri, {
      headers: {
        'Accept': 'application/json',
      }
    });
    ok(!result.ok);
    strictEqual(result.status, 401);
    strictEqual(result.body.error, true);
    strictEqual(result.body.details.code, 401);
    strictEqual(result.body.details.message, 'Unauthorized');
  }

  @test()
  async e403() {
    const uri = '/forbidden-api/test?q=str';
    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      await this.navigate(page, getConfig().hostURL + uri);
      const text = await this.getTextFromPage(page);

      // validate query to be in place
      strictEqual(text, '403: Forbidden');
    });
  }
}
