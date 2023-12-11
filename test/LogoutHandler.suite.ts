import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";

export class BaseLogoutHandlerSuite extends BaseSuite {
  @test()
  async logout() {
    const uri = '/api/test?q=str';
    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      // make sure we can access the resource
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);
      strictEqual(json.http.url, uri);

      // logout and try to access the same resource
      await this.navigate(page, getConfig().hostURL + getConfig().logoutPath);
      await this.navigate(page, getConfig().hostURL + uri);
      const text = await this.getTextFromPage(page);
      strictEqual(text, '401: Unauthorized');
    });
  }
}

@suite()
class HttpLogoutHandlerSuite extends BaseLogoutHandlerSuite {
  constructor() {
    super('HTTP', false);
  }
}

@suite()
class HttpsLogoutHandlerSuite extends BaseLogoutHandlerSuite {
  constructor() {
    super('HTTP', true);
  }
}

@suite()
class Http2LogoutHandlerSuite extends BaseLogoutHandlerSuite {
  constructor() {
    super('HTTP2', true);
  }
}
