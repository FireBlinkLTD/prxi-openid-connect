import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { ok, strictEqual } from "assert";

@suite()
class PageMappingSuite extends BaseSuite {
  @test()
  async pageEndpoint() {
    const uri = '/pages/test?q=str';
    await this.withNewPage(getConfig().hostURL + uri, async (page) => {
      await this.loginOnKeycloak(page);
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
  async e404Endpoint() {
    const uri = '/non-existing-mapping';
    await this.withNewPage(getConfig().hostURL + uri, async (page) => {
      const url = page.url();
      ok(url.indexOf(getConfig().redirect.pageRequest.e404) === 0, `Actual URL: ${url}; Expected URL: ${getConfig().redirect.pageRequest.e404}`);
    });
  }

  @test()
  async e404EndpointWithoutRedirect() {
    await this.reloadPrxiWith({
      redirect: {
        pageRequest: {
          e404: null,
        }
      }
    });

    const uri = '/non-existing-mapping';
    await this.withNewPage(getConfig().hostURL + uri, async (page) => {
      const text = await this.getTextFromPage(page);
      strictEqual(text, '404: Not found')
    });
  }

  @test()
  async e403Endpoint() {
    const uri = '/forbidden-pages/test?q=str';
    await this.withNewPage(getConfig().hostURL + uri, async (page) => {
      await this.loginOnKeycloak(page);
      const url = page.url();
      ok(url.indexOf(getConfig().redirect.pageRequest.e403) === 0, `Actual URL: ${url}; Expected URL: ${getConfig().redirect.pageRequest.e403}`);
    });
  }
}
