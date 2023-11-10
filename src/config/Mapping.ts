import { HttpMethod } from "prxi";

export interface Mapping {
  pattern: RegExp;
  methods?: HttpMethod[];
  claims?: Record<string, string[]>;
}

/**
  * Prepare mappings from the environment variable value
  * @param value
  * @param requireClaims
  * @returns
  */
export const prepareMappings = (value: string, requireClaims: boolean): Mapping[] => {
  const result: Mapping[] = [];
  if (value) {
    const json = JSON.parse(value);
    for (const r of json) {
      const mapping = prepareMapping(r, requireClaims);
      result.push(mapping);
    }
  }

  return result;
}

/**
 * Prepare single mapping
 * @param value
 * @param requireClaims
 * @returns
 */
export const prepareMapping = (value: any, requireClaims: boolean): Mapping => {
  if (!value.pattern) {
    throw new Error(`Unable to parse mappings for value: ${value}`);
  }

  // add leading ^ character if missing to the pattern
  if (value.pattern.indexOf('^') !== 0) {
    value.pattern = '^' + value.pattern;
  }

  // add trailing $ character if missing to the pattern
  if (!value.pattern.endsWith('$')) {
    value.pattern = value.pattern + '$';
  }

  if (requireClaims && !value.claims) {
    throw new Error(`"claims" configuration is missing for value: ${JSON.stringify(value)}`);
  }

  return {
    pattern: new RegExp(value.pattern, 'i'),
    methods: value.methods?.map((m: string) => m.toUpperCase()),
    claims:  value.claims,
  }
}
