import { suite, test } from "@testdeck/mocha";
import { BaseSuite } from "./Base.suite";
import { getConfig } from "../src/config/getConfig";
import { strictEqual } from "assert";

@suite()
class TokenRefreshSuite extends BaseSuite {
  @test()
  async success() {
    const uri = '/api/test?q=str';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      let json = await this.getJsonFromPage(page);

      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');

      // remove access token cookie, keep the refresh one
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });

      // do the same check once again
      await this.navigate(page, getConfig().hostURL + uri);
      json = await this.getJsonFromPage(page);

      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');
    });
  }

  @test()
  async corruptedTokenRequiredAuth() {
    const uri = '/api/test?q=str';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      const json = await this.getJsonFromPage(page);

      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');

      // remove access token cookie, replace refresh one with corrupted value
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });
      await page.setCookie( { name: getConfig().cookies.names.refreshToken, value: 'oops' });

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

      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');

      // remove access token cookie, replace refresh one with corrupted value
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });
      await page.setCookie( { name: getConfig().cookies.names.refreshToken, value: 'oops' });

      // do the same check once again
      await this.navigate(page, getConfig().hostURL + uri);
      json = await this.getJsonFromPage(page);

      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');

      const cookies = await page.cookies()
      const refreshTokenCookie = cookies.find(c => c.name === getConfig().cookies.names.refreshToken );
      strictEqual(refreshTokenCookie, undefined);
    });
  }

  @test()
  async corruptedTokenOptionalAuthWithCookieMerge() {
    const uri = '/api-optional/test?echo_header=set-cookie%3Atest%3Dyes';

    await this.withNewPage(getConfig().hostURL + '/pages/test', async (page) => {
      await this.loginOnKeycloak(page);

      await this.navigate(page, getConfig().hostURL + uri);
      let json = await this.getJsonFromPage(page);

      strictEqual(json.http.originalUrl, uri);

      // remove access token cookie, replace refresh one with corrupted value
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });
      await page.setCookie( { name: getConfig().cookies.names.refreshToken, value: 'oops' });

      // do the same check once again
      await this.navigate(page, getConfig().hostURL + uri);
      json = await this.getJsonFromPage(page);

      strictEqual(json.http.originalUrl, uri);

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

      strictEqual(json.http.originalUrl, uri);
      strictEqual(json.request.query.q, 'str');

      // remove access token and refresh one cookies
      await page.deleteCookie({ name: getConfig().cookies.names.accessToken });
      await page.deleteCookie( { name: getConfig().cookies.names.refreshToken });

      // do the same check once again
      await this.navigate(page, getConfig().hostURL + uri);
      const text = await this.getTextFromPage(page);
      strictEqual(text, '401: Unauthorized');
    });
  }
}
