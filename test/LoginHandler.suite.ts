import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";

@suite()
export class LoginHandlerSuite extends BaseSuite {
  @test()
  async login() {
    const uri = '/api/test?q=str';
    await this.withNewPage(getConfig().hostURL + getConfig().loginPath, async (page) => {
      await this.loginOnKeycloak(page);

      // make sure we can access the resource
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);
      strictEqual(json.http.originalUrl, uri);
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
      strictEqual(json.http.originalUrl, uri);
    });
  }
}
