import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";

@suite()
export class LogoutHandlerSuite extends BaseSuite {
  @test()
  async logout() {
    const uri = '/api/test?q=str';
    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      // make sure we can access the resource
      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);
      strictEqual(json.http.originalUrl, uri);

      // logout and try to access the same resource
      await this.navigate(page, getConfig().hostURL + getConfig().logoutPath);
      await this.navigate(page, getConfig().hostURL + uri);
      const text = await this.getTextFromPage(page);
      strictEqual(text, '401: Unauthorized');
    });
  }
}
