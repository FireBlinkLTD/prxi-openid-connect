import { HttpMethod } from "prxi";

export interface Mapping {
  pattern: RegExp;
  methods?: HttpMethod[];
  claims?: Record<string, string[]>;
}

/**
  * Prepare mappings file from the environment variable value
  * @param value
  * @param requireClaims
  * @returns
  */
export const prepareMappings = (value: string, requireClaims: boolean): Mapping[] => {
 const result: Mapping[] = [];
 if (value) {
   const json = JSON.parse(value);
   for (const r of json) {
     if (!r.pattern) {
       throw new Error(`Unable to parse mappings for value: ${value}`);
     }

     // add leading ^ character if missing to the pattern
     if (r.pattern.indexOf('^') !== 0) {
       r.pattern = '^' + r.pattern;
     }

     // add trailing $ character if missing to the pattern
     if (!r.pattern.endsWith('$')) {
       r.pattern = r.pattern + '$';
     }

     result.push({
       pattern: new RegExp(r.pattern, 'i'),
       methods: r.methods?.map((m: string) => m.toUpperCase()),
       claims: requireClaims ? r.claims : undefined,
     });

     if (requireClaims && !r.claims) {
       throw new Error(`restrictTo configuration is missing for value: ${value}`);
     }
   }
 }


 return result;
}
