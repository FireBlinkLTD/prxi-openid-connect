import 'dotenv/config';

import { Config } from "../src/config/Config";
import { getConfig, updateConfig } from "../src/config/getConfig";
import puppeteer, { Page } from 'puppeteer';
import { start } from '../src/Server';
import { Prxi } from 'prxi';

export class BaseSuite {
  private originalConfig: Config;
  protected prxi: Prxi;

  public async before() {
    // get original configuration
    this.originalConfig = structuredClone(getConfig());
    this.prxi = await start();
  }

  public async after() {
    // set original configuration back
    updateConfig(this.originalConfig);
    await this.prxi?.stop();
  }

  protected async reloadPrxiWith(config: Partial<Config>): Promise<void> {
    await this.prxi.stop();
    updateConfig({
      ...this.originalConfig,
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
    console.log(`[puppeteer] -> Launching browser`);
    const browser = await puppeteer.launch({
      headless: 'new',
    });

    try {
      console.log(`[puppeteer] -> Opening new page`);
      const page = await browser.newPage();
      try {
        if (beforeNavigate) {
          await beforeNavigate(page);
        }

        await this.navigate(page, url);

        console.log(`[puppeteer] -> Calling the handler`);
        await handler(page);
      } catch (e) {
        try {
          const path = `puppeteer-error-${Date.now()}.png`;
          console.log(e);
          console.log(`Error occurred while on page: ${page.url()}; Screenshot name: ${path}`);
          await page.screenshot({ path });
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
    console.log('[puppeteer] -> Logging out');
    await this.navigate(page, getConfig().hostURL + getConfig().logoutPath);
  }

  /**
   * Fill KC login form
   * @param page
   */
  protected async loginOnKeycloak(page: Page): Promise<void> {
    console.log('[puppeteer] -> Login in');

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
    console.log('[puppeteer] -> navigating to ', url);
    await page.goto(url);
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
