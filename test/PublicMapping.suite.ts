import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { ok, strictEqual } from "assert";

@suite()
class PublicMappingSuite extends BaseSuite {
  @test()
  async publicEndpointWithoutAuth() {
    const uri = '/public/test?q=str';
    const result = await this.fetch(getConfig().hostURL + uri);
    ok(result.ok);
    strictEqual(result.body.http.url, uri);
  }
}
