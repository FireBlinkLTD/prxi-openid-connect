import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";

@suite()
class ErrorHandlerSuite extends BaseSuite {
  @test()
  async e503() {
    await this.reloadPrxiWith({
      // set incorrect upstream
      upstream: getConfig().upstream + 1,
    })

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      const text = await this.getTextFromPage(page);
      strictEqual(text, '503: Service Unavailable')
    });
  }

  @test()
  async e503WithRedirect() {
    await this.reloadPrxiWith({
      // set incorrect upstream
      upstream: getConfig().upstream + 1,
      redirect: {
        pageRequest: {
          e503: getConfig().upstream + '/api/test'
        }
      }
    })

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      const json = await this.getJsonFromPage(page);
      strictEqual(json.http.originalUrl, '/api/test');
    });
  }
}
