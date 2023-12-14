import 'dotenv/config';

import { Config } from "../src/config/Config";
import { getConfig, updateConfig } from "../src/config/getConfig";
import puppeteer, { Page } from "puppeteer";
import { start } from "../src/Server";
import { Prxi } from "prxi";
import { readFileSync } from "fs";
import { resolve } from "path";
import { context } from "@testdeck/mocha";
import { Console } from "../src/utils/Console";

export class BaseSuite {
  private originalConfig: Config;
  protected prxi: Prxi;

  constructor(protected mode: 'HTTP' | 'HTTP2' = 'HTTP', protected secure = false) {}

  public async before() {
    Console.printSolidBox(`[TEST] [${this.mode}]${this.secure ? ' [secure]' : ''} ${this[context].test.title}`);
    // get original configuration
    this.originalConfig = structuredClone(getConfig());
    this.fixConfig();
    this.prxi = await start();
  }

  public async after() {
    // set original configuration back
    updateConfig(this.originalConfig);
    try {
      await this.prxi?.stop();
      this.prxi = null;
    } catch (e) {
      console.error(e);
    }
    Console.printDoubleBox(`[TEST] [${this.mode}]${this.secure ? ' [secure]' : ''} ${this[context].test.title}`);
  }

  /**
   * Modify configuration based on settings set in the constructor
   */
  protected fixConfig() {
    getConfig().mode = this.mode;

    const fixURL = (url: string): string => {
      if (this.secure && this.mode === 'HTTP') {
        return url.replace('http://localhost:7001', 'https://localhost:7002');
      }

      if (!this.secure && this.mode === 'HTTP2') {
        return url.replace('http://localhost:7001', 'http://localhost:7003');
      }

      if (this.secure && this.mode === 'HTTP2') {
        return url.replace('http://localhost:7001', 'https://localhost:7004');
      }

      return url;

    }

    getConfig().upstream = fixURL(getConfig().upstream);

    if (getConfig().redirect.pageRequest.e403) {
      getConfig().redirect.pageRequest.e403 = fixURL(getConfig().redirect.pageRequest.e403);
    }
    if (getConfig().redirect.pageRequest.e404) {
      getConfig().redirect.pageRequest.e404 = fixURL(getConfig().redirect.pageRequest.e404);
    }
    if (getConfig().redirect.pageRequest.e500) {
      getConfig().redirect.pageRequest.e500 = fixURL(getConfig().redirect.pageRequest.e500);
    }
    if (getConfig().redirect.pageRequest.e503) {
      getConfig().redirect.pageRequest.e503 = fixURL(getConfig().redirect.pageRequest.e503);
    }

    if (this.secure) {
      getConfig().openid.clientId = getConfig().openid.clientId + '_secure';

      // update cookie settings
      getConfig().cookies.secure = true;

      // set TLS settings
      getConfig().secure = {
        key: readFileSync(resolve(__dirname, 'key.pem')),
        cert: readFileSync(resolve(__dirname, 'cert.pem')),
      }

      // update urls

      getConfig().hostURL = getConfig().hostURL.replace(/http:/g, 'https:');
    } else {
      getConfig().secure = undefined;
    }
  }

  protected async reloadPrxiWith(config: Partial<Config>): Promise<void> {
    await this.prxi.stop(true);
    updateConfig({
      ...getConfig(),
      ...config,
    });
    this.prxi = await start();
  }

  /**
   * Fetch
   * @param url
   * @returns
   */
  protected async fetch(url: string, init?: RequestInit): Promise<{
    ok: boolean,
    status: number,
    body: any
  }> {
    const resp = await fetch(url, init);

    return {
      ok: resp.ok,
      status: resp.status,
      body: await resp.json()
    }
  }

  /**
   * Open page, navigate and call the handler
   * @param url
   * @param handler
   * @param extraHeaders
   * @returns
   */
  protected async withNewPage(url: string, handler: (page: Page) => Promise<void>, beforeNavigate?: (page: Page) => Promise<void>): Promise<void> {
    console.log(`[test] -> Launching browser`);
    const browser = await puppeteer.launch({
      headless: 'new',
      ignoreHTTPSErrors: true,
      args: [ '--ignore-certificate-errors' ]
    });

    try {
      console.log(`[test] -> Opening new page`);
      const page = await browser.newPage();
      try {
        if (beforeNavigate) {
          await beforeNavigate(page);
        }

        await this.navigate(page, url);

        console.log(`[test] -> Calling the handler`);
        await handler(page);
      } catch (e) {
        try {
          const path = `puppeteer-error-${Date.now()}.png`;
          console.log(`[test] Error occurred while on page: ${page.url()}; Screenshot name: ${path}`);
          console.error('[test] Error', e);
          try {
            await page.screenshot({ path });
          } catch (e) {
            console.log('[test] Unable to create screenshot', e);
          }
        } finally {
          throw e;
        }
      }
    } finally {
      browser.close();
    }
  }

  /**
   * Access logout endpoint
   * @param page
   */
  protected async logout(page: Page): Promise<void> {
    console.log('[test] -> Logging out');
    await this.navigate(page, getConfig().hostURL + getConfig().paths.logout);
  }

  /**
   * Fill KC login form
   * @param page
   */
  protected async loginOnKeycloak(page: Page): Promise<void> {
    console.log('[test] -> Login in');

    await page.focus('#username');
    await page.keyboard.type(process.env.KC_TEST_USER);

    await page.focus('#password');
    await page.keyboard.type(process.env.KC_TEST_USER_PASSWORD);

    await page.click('#kc-login');

    // give 0.5s timeout for all the redirects to finish
    await new Promise<void>(res => setTimeout(res, 500));
  }

  /**
   * Navigate to URL
   * @param page
   * @param url
   */
  protected async navigate(page: Page, url: string): Promise<void> {
    console.log('[test] -> navigating to ', url);
    await page.goto(url, {
      waitUntil: 'networkidle0',
    });
  }

  /**
   * Utility function to await certain amount of milliseconds
   * @param time
   */
  protected async wait(time: number): Promise<void> {
    await new Promise(res => setTimeout(res, time));
  }

  /**
   * Extract JSON from a page body
   * @param page
   * @returns
   */
  protected async getJsonFromPage(page: Page): Promise<any> {
    const body = await this.getTextFromPage(page);

    try {
      return JSON.parse(body);
    } catch (e) {
      throw new Error(`Failed to extract JSON from page ${page.url()}`);
    }
  }

  /**
   * Extract text from a page body
   * @param page
   * @returns
   */
  protected async getTextFromPage(page: Page): Promise<any> {
    return await page.evaluate(() => document.querySelector('pre').innerHTML);
  }
}
