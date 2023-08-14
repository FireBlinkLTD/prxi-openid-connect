import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { ok, strictEqual } from "assert";

@suite()
class ApiMappingSuite extends BaseSuite {
  @test()
  async passIn() {
    const uri = '/api/test?q=str';
    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);

      // validate query to be in place
      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');

      // validate cookies
      ok(json.request.cookies[getConfig().cookies.names.accessToken]);
      ok(json.request.cookies[getConfig().cookies.names.idToken]);
      ok(json.request.cookies[getConfig().cookies.names.refreshToken]);
      ok(!json.request.cookies[getConfig().cookies.names.originalPath]);
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
