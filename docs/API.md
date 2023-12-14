# prxi-openid-connect API

All the API endpoints are turned off by default. Each should be enabled individually by providing the path via environment variable.
All the API endpoint are invoked before

## Who am I?

An API endpoint that helps to extract user related information from Auth and ID tokens.

Environment variable: `WHOAMI_API_PATH`, example: `/_/api/whoami`

`GET` request to the provided path will return the JSON response that will contain the following information:

```json
{
  // flag to determine if user is authenticated or not
  "anonymous": false,
  "claims": {
    // all the claims retrieved from Access and ID tokens based on the JWT_AUTH_CLAIM_PATHS configuration
    "auth": {
      /* ... */
    },
    // all the claims retrieved from Access and ID tokens based on the JWT_PROXY_CLAIM_PATHS configuration
    "proxy": {
      /* ... */
    },
  },

  // optional field, returns the meta information set by the webhook API upon the login action
  "meta": {}
}
```

When user is not authenticated API response will look like the following:

```json
{
  "anonymous": true,
  "claims": {
    "auth": {},
    "proxy": {}
  }
}
```
