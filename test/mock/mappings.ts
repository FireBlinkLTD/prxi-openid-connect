import { readFileSync } from "fs";
import { join } from "path";
import { HttpMethod } from "prxi"

export interface Mapping {
  method: HttpMethod;
  path: string;
  status: number;
  response: Buffer;
  headers?: Record<string, string>;
}

/**
 * Read file
 * @param path
 * @returns
 */
const readFile = (path: string): Buffer => {
  return readFileSync(join(__dirname, path));
}

/**
 * Request Mappings
 */
export const mappings: Mapping[] = [
  {
    method: 'GET',
    path: '/configuration',
    status: 200,
    response: readFile('responses/configuration.json'),
    headers: {
      'Content-Type': 'application/json',
    },
  },

  {
    method: 'POST',
    path: '/login-fail',
    status: 500,
    response: readFile('responses/login-fail.json'),
    headers: {
      'Content-Type': 'application/json',
    },
  },

  {
    method: 'POST',
    path: '/refreshToken',
    status: 200,
    response: readFile('responses/refresh-token.json'),
    headers: {
      'Content-Type': 'application/json',
    },
  },

  {
    method: 'POST',
    path: '/redirectTo',
    status: 200,
    response: readFile('responses/redirect-to.json'),
    headers: {
      'Content-Type': 'application/json',
    },
  },

  {
    method: 'POST',
    path: '/meta',
    status: 200,
    response: readFile('responses/meta.json'),
    headers: {
      'Content-Type': 'application/json',
    },
  },

  {
    method: 'POST',
    path: '/logout-fail',
    status: 200,
    response: readFile('responses/logout-fail.json'),
    headers: {
      'Content-Type': 'application/json',
    },
  },

  {
    method: 'POST',
    path: '/logout',
    status: 200,
    response: readFile('responses/logout.json'),
    headers: {
      'Content-Type': 'application/json',
    },
  },

  {
    method: 'POST',
    path: '/reject',
    status: 200,
    response: readFile('responses/reject.json'),
    headers: {
      'Content-Type': 'application/json',
    },
  },
];
