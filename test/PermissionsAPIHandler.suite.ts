import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { deepEqual } from "assert";
import { sign } from "jsonwebtoken";

abstract class BasePermissionsAPIHandlerSuite extends BaseSuite {
  @test()
  async authorized() {
    const authCookies = await this.loginAndGetAuthCookies();
    const json = await this.makePost(getConfig().hostURL + getConfig().paths.api.permissions, [
      {
        path: '/public/test',
        method: 'GET',
      },
      {
        path: '/pages/auth/access',
        method: 'GET',
      },
      {
        path: '/forbidden-pages/auth/pages',
        method: 'GET',
      },
      {
        path: '/api/auth',
        method: 'GET'
      },
      {
        path: '/api-optional/auth',
        method: 'GET'
      }
    ], authCookies);

    deepEqual(json.data, {
      anonymous: false,
      resources: [
        {
          path: '/public/test',
          method: 'GET',
          allowed: true,
        },
        {
          path: '/pages/auth/access',
          method: 'GET',
          allowed: true,
        },
        {
          path: '/forbidden-pages/auth/pages',
          method: 'GET',
          allowed: false,
        },
        {
          path: '/api/auth',
          method: 'GET',
          allowed: true,
        },
        {
          path: '/api-optional/auth',
          method: 'GET',
          allowed: true,
        }
      ],
    });
  }

  @test()
  async invalidAuth() {
    const json = await this.makePost(getConfig().hostURL + getConfig().paths.api.permissions, [], [
      {
        name: getConfig().cookies.names.accessToken,
        value: sign({}, 'test')
      }
    ]);

    deepEqual(json.data, {
      details: {
        code: 401,
        message: 'Unauthorized'
      },
      error: true
    });
  }

  @test()
  async anonymous() {
    const json = await this.makePost(getConfig().hostURL + getConfig().paths.api.permissions, [
      {
        path: '/public/test',
        method: 'GET',
      },
      {
        path: '/pages/auth/access',
        method: 'GET',
      },
      {
        path: '/forbidden-pages/auth/pages',
        method: 'GET',
      },
      {
        path: '/api/auth',
        method: 'GET'
      },
      {
        path: '/api-optional/auth',
        method: 'GET'
      }
    ]);

    deepEqual(json.data, {
      anonymous: true,
      resources: [
        {
          path: '/public/test',
          method: 'GET',
          allowed: true,
        },
        {
          path: '/pages/auth/access',
          method: 'GET',
          allowed: false,
        },
        {
          path: '/forbidden-pages/auth/pages',
          method: 'GET',
          allowed: false,
        },
        {
          path: '/api/auth',
          method: 'GET',
          allowed: false,
        },
        {
          path: '/api-optional/auth',
          method: 'GET',
          allowed: true,
        }
      ],
    });
  }
}

@suite()
class HttpPermissionsAPIHandlerSuite extends BasePermissionsAPIHandlerSuite{
  constructor() {
    super('HTTP', false);
  }
}

@suite()
class HttpsPermissionsAPIHandlerSuite extends BasePermissionsAPIHandlerSuite{
  constructor() {
    super('HTTP', true);
  }
}

@suite()
class Http2PermissionsAPIHandlerSuite extends BasePermissionsAPIHandlerSuite{
  constructor() {
    super('HTTP2', true);
  }
}
