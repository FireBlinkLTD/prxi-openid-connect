import { HttpMethod } from "prxi";

export enum MAPPING_MODE {
  'ANY' = 'ANY',
  'ALL' = 'ALL',
}

export interface Mapping {
  pattern: RegExp;
  methods?: HttpMethod[];
  exclude: {
    pattern: RegExp;
    methods?: HttpMethod[];
  }[];
  auth: {
    required: boolean,
    mode: MAPPING_MODE,
    claims: Record<string, string[]>;
  }
}

/**
  * Prepare mappings from the environment variable value
  * @param value
  * @returns
  */
export const prepareMappings = (value: string): Mapping[] => {
  const result: Mapping[] = [];
  /* istanbul ignore else */
  if (value) {
    let json;
    try {
      json = JSON.parse(value);
    } catch (e) {
      /* istanbul ignore next */
      throw new Error(`Invalid mapping, unable to parse json for value: ${value}`);
    }

    /* istanbul ignore next */
    if (!Array.isArray(json)) {
      throw new Error(`Invalid mapping, array expected instead of: ${value}`);
    }

    for (const r of json) {
      const mapping = prepareMapping(r);
      result.push(mapping);
    }
  }

  return result;
}

/**
 * Prepare pattern
 * @param value
 * @returns
 */
export const preparePattern = (value: {pattern?: string}): RegExp => {
  let { pattern } = value;
  /* istanbul ignore next */
  if (!pattern) {
    throw new Error(`Unable to parse mappings for value: ${JSON.stringify(value)}`);
  }

  // add leading ^ character if missing to the pattern
  if (pattern.indexOf('^') !== 0) {
    pattern = '^' + pattern;
  }

  // add trailing $ character if missing to the pattern
  if (!pattern.endsWith('$')) {
    pattern = pattern + '$';
  }

  return new RegExp(pattern, 'i');
}

/**
 * Prepare single mapping
 * @param value
 * @param requireClaims
 * @returns
 */
export const prepareMapping = (value: any): Mapping => {
  const pattern = preparePattern(value);

  if (!value.auth) {
    value.auth = {
      required: false,
      claims: {},
    }
  }

  // by default, if not explicitly set authentication is required
  if (value.auth.required !== false) {
    value.auth.required = true;
  }

  if (!value.auth.mode) {
    value.auth.mode = MAPPING_MODE.ANY;
  }
  value.auth.mode = value.auth.mode.toUpperCase();

  if (!value.auth.claims) {
    value.auth.claims = {};
  }

  return {
    pattern,
    methods: value.methods && value.methods.map((m: string) => m.toUpperCase()),
    auth:  value.auth,
    exclude: (value.exclude || []).map((e: any) => {
      return {
        pattern: preparePattern(e),
        methods: e.methods && e.methods.map((m: string) => m.toUpperCase()),
      }
    })
  }
}
