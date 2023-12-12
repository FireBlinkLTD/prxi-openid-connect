import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { ok, strictEqual } from "assert";

class BasePublicMappingSuite extends BaseSuite {
  @test()
  async publicEndpointWithoutAuth() {
    const uri = '/public/test?q=str';
    const result = await this.fetch(getConfig().hostURL + uri);
    ok(result.ok);
    strictEqual(result.body.http.url, uri);
  }
}

@suite()
class HttpPublicMappingSuite extends BasePublicMappingSuite {
  constructor() {
    super('HTTP', false);
  }
}

@suite()
class HttpsPublicMappingSuite extends BasePublicMappingSuite {
  constructor() {
    super('HTTP', true);
  }
}

@suite()
class Http2PublicMappingSuite extends BasePublicMappingSuite {
  constructor() {
    super('HTTP2', true);
  }
}
