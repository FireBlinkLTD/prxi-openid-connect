import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";

@suite()
class HealthzHandlerSuite extends BaseSuite {
  @test()
  async healthz() {
    await this.withNewPage(getConfig().hostURL + getConfig().paths.health, async (page) => {
      let json = await this.getJsonFromPage(page);
      strictEqual(json.success, true);
    });
  }
}
