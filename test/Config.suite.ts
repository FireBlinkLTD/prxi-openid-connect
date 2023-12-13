import { suite, test } from "@testdeck/mocha";
import { snakeToCamelCase, getSecureSettings } from "../src/config/getConfig";
import { deepEqual, strictEqual } from "assert";
import { resolve } from "path";
import { readFileSync } from "fs";

@suite()
class ConfigSuite {
  @test()
  snakeToCamelCase() {
    strictEqual(snakeToCamelCase('TEST'), 'test');
    strictEqual(snakeToCamelCase('TEST_test'), 'testTest');
    strictEqual(snakeToCamelCase('test_test_TeSt'), 'testTestTest');
  }

  @test()
  getSecureSettings() {
    try {
      process.env.TLS_FILE_TEST_KEY = resolve(__dirname, 'cert.pem');
      process.env.TLS_STRING_TEST_STR = 'test';
      process.env.TLS_NUMBER_TEST_NUMBER = '123';

      deepEqual(getSecureSettings(), {
        testStr: 'test',
        testNumber: 123,
        testKey: readFileSync(process.env.TLS_FILE_TEST_KEY),
      })
    } finally {
      delete process.env.TLS_FILE_TEST_KEY;
      delete process.env.TLS_STRING_TEST_STR;
      delete process.env.TLS_NUMBER_TEST_NUMBER;
    }
  }
}
