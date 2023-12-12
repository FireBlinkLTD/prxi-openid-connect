import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";
import { OpenIDUtils } from "../src/utils/OpenIDUtils";

export class BaseLoginHandlerSuite extends BaseSuite {
  @test()
  async login() {
    const uri = '/api/test?q=str';
    await this.withNewPage(getConfig().hostURL + getConfig().loginPath, async (page) => {
      await this.loginOnKeycloak(page);

      // make sure we can access the resource
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);
      strictEqual(json.http.url, uri);
    });
  }

  @test()
  async loginWithCustomRedirect() {
    const uri = '/api/test?q=str';
    await this.withNewPage(getConfig().hostURL + getConfig().loginPath + `?redirectTo=${encodeURIComponent(uri)}`, async (page) => {
      await this.loginOnKeycloak(page);

      // make sure we can access the resource
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);
      strictEqual(json.http.url, uri);
    });
  }

  @test()
  async htmxRedirect() {
    let headers: Record<string, string> = null;
    let status: number = null;
    let url: string = null;
    await this.withNewPage(
      getConfig().hostURL + '/pages/test',
      // after navigate
      async (page) => {
        const json = await this.getJsonFromPage(page);

        strictEqual(status, 200);
        strictEqual(url, getConfig().hostURL + '/pages/test');
        strictEqual(headers && headers['hx-redirect'], OpenIDUtils.getAuthorizationUrl());
        strictEqual(json.redirectTo.replace(/&amp;/g, '&'), OpenIDUtils.getAuthorizationUrl());
      },
      // before navigate
      async (page) => {
        await page.setExtraHTTPHeaders({'Hx-Boosted': 'true'});

        page.once('response', async(response) => {
          if (!headers) {
            headers = response.headers();
            status = response.status();
            url = response.url();
          }
        })
      }
    );
  }
}

@suite()
class HttpLoginHandlerSuite extends BaseLoginHandlerSuite {
  constructor() {
    super('HTTP', false);
  }
}

@suite()
class HttpsLoginHandlerSuite extends BaseLoginHandlerSuite {
  constructor() {
    super('HTTP', true);
  }
}

@suite()
class Http2LoginHandlerSuite extends BaseLoginHandlerSuite {
  constructor() {
    super('HTTP2', true);
  }
}
