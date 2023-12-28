import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { ok, strictEqual } from "assert";
import { Constants } from "../src/types/Constants";

class BaseTokenRefreshSuite extends BaseSuite {
  @test()
  async success() {
    const uri = '/api/test?q=str';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      let json = await this.getJsonFromPage(page);

      strictEqual(json.http.url, uri);

      // remove access token cookie, keep the refresh one
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });

      // do the same check once again
      await this.navigate(page, getConfig().hostURL + uri);
      json = await this.getJsonFromPage(page);

      strictEqual(json.http.url, uri);
    });
  }

  @test()
  async corruptedTokenRequiredAuth() {
    const uri = '/api/test?q=str';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);

      strictEqual(json.http.url, uri);

      // remove access token cookie, replace refresh one with corrupted value
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });
      await page.setCookie( {
        name: getConfig().cookies.names.refreshToken,
        value: 'oops',
        url: getConfig().hostURL,
      });

      // do the same check once again
      await this.navigate(page, getConfig().hostURL + uri);
      const text = await this.getTextFromPage(page);
      strictEqual(text, '401: Unauthorized');

      const cookies = await page.cookies()
      const refreshTokenCookie = cookies.find(c => c.name === getConfig().cookies.names.refreshToken );
      strictEqual(refreshTokenCookie, undefined);
    });
  }

  @test()
  async corruptedTokenOptionalAuth() {
    const uri = '/api-optional/test?q=str';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      let json = await this.getJsonFromPage(page);

      strictEqual(json.http.url, uri);

      // remove access token cookie, replace refresh one with corrupted value
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });
      await page.setCookie( {
        name: getConfig().cookies.names.refreshToken,
        value: 'oops',
        url: getConfig().hostURL,
      });

      // do the same check once again
      await this.navigate(page, getConfig().hostURL + uri);
      json = await this.getJsonFromPage(page);

      strictEqual(json.http.url, uri);

      const cookies = await page.cookies()
      const refreshTokenCookie = cookies.find(c => c.name === getConfig().cookies.names.refreshToken );
      strictEqual(refreshTokenCookie, undefined);
    });
  }

  @test()
  async corruptedTokenOptionalAuthWithCookieMerge() {
    const uri = '/api-optional/test';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      let json = await this.getJsonFromPage(page);

      strictEqual(json.http.url, uri);

      // remove access token cookie, replace refresh one with corrupted value
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });
      await page.setCookie( {
        name: getConfig().cookies.names.refreshToken,
        value: 'oops',
        url: getConfig().hostURL,
      });

      // do the same check once again
      await page.setExtraHTTPHeaders({
        'x-add-headers': JSON.stringify({
          'set-cookie': 'test=yes',
        })
      })
      await this.navigate(page, getConfig().hostURL + uri);
      json = await this.getJsonFromPage(page);

      strictEqual(json.http.url, uri);

      const cookies = await page.cookies()
      const refreshTokenCookie = cookies.find(c => c.name === getConfig().cookies.names.refreshToken );
      strictEqual(refreshTokenCookie, undefined);
      strictEqual(cookies.find(c => c.name === 'test')?.value, 'yes');
    });
  }

  @test()
  async justIdToken() {
    const uri = '/api/test?q=str';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      let json = await this.getJsonFromPage(page);

      strictEqual(json.http.url, uri);

      // remove access token and refresh one cookies
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });
      await page.deleteCookie( { name: getConfig().cookies.names.refreshToken });

      // do the same check once again
      await this.navigate(page, getConfig().hostURL + uri);
      const text = await this.getTextFromPage(page);
      strictEqual(text, '401: Unauthorized');
    });
  }

  @test()
  async headerBased() {
    const uri = '/api/test?q=str';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      let json = await this.getJsonFromPage(page);
      strictEqual(json.http.url, uri);

      const oldCookies = await page.cookies();

      await page.setExtraHTTPHeaders({
        'x-add-headers': JSON.stringify({
          [Constants.HEADER_X_PRXI_REFRESH_TOKENS.toUpperCase()]: 'true',
        })
      })

      await this.navigate(page, getConfig().hostURL + uri);
      json = await this.getJsonFromPage(page);
      strictEqual(json.http.url, uri);

      const newCookies = await page.cookies();

      const newAccessToken = newCookies.find(c => c.name === getConfig().cookies.names.accessToken);
      const oldAccessToken = oldCookies.find(c => c.name === getConfig().cookies.names.accessToken);
      ok(newAccessToken);
      ok(oldAccessToken);
      ok(newAccessToken.value !== oldAccessToken.value)

      const newIdToken = newCookies.find(c => c.name === getConfig().cookies.names.idToken);
      const oldIdToken = oldCookies.find(c => c.name === getConfig().cookies.names.idToken);
      ok(newIdToken);
      ok(oldIdToken);
      ok(newIdToken.value !== oldIdToken.value);

      const newRefreshToken = newCookies.find(c => c.name === getConfig().cookies.names.refreshToken);
      const oldRefreshToken = oldCookies.find(c => c.name === getConfig().cookies.names.refreshToken);
      ok(newRefreshToken);
      ok(oldRefreshToken);
      ok(newRefreshToken.value !== oldRefreshToken.value);
    });
  }
}

@suite()
class HttpTokenRefreshSuite extends BaseTokenRefreshSuite {
  constructor() {
    super('HTTP', false);
  }
}

@suite()
class HttpsTokenRefreshSuite extends BaseTokenRefreshSuite {
  constructor() {
    super('HTTP', true);
  }
}

@suite()
class Http2TokenRefreshSuite extends BaseTokenRefreshSuite {
  constructor() {
    super('HTTP2', true);
  }
}
