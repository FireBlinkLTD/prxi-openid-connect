# fireblink/prxi-openid-connect

[OpenID Connect reverse proxy server](https://hub.docker.com/r/fireblink/prxi-openid-connect) that based on a zero-dependency proxy library [prxi](https://www.npmjs.com/package/prxi).

Can be used to provide SSO login (Authentication/Authorization) functionality to any web application or API service, or both at the same time.
In most of the cases prxi-openid-connect should be deployed in front of your application to intercept all the requests:

![diagram](docs/assets/prxi-openid-connect.png)

Proxy will handle authentication and authorization for individual path mappings, by allowing access only if JWT token contains allowed claims.

Proxy clearly distinguish API and HTML requests, so when access token expires (and can't be refreshed) or missing API request won't return HTML of the login page, but a JSON error object and correct http status code (401). The same applies to a case when access is denied for a user for requested resource (403 error)

In addition upon every login, logout or token refresh action prxi-openid-connect can call optional webhook endpoints and even change the flow based on the response. This might be handy to track audit logs, request token refresh one more time, etc.

## Configuration

### Environment Variables

#### Generic settings
- `LICENSE_CONSENT` - A `true` value should be provided when you agree to use prxi-openid-connect under the current license terms. Please refer to the [License](#license) for more details.
- `MODE` - [optional] Server mode, can be either `HTTP` or `HTTP2` (default value: `HTTP`). Note: when HTTP/2 is enabled, upstream should also support it, dynamic conversion from HTTP/2 to HTTP/1.1 is not supported.
- `PORT` - [optional] port number to listen (default value: `3000`)
- `HOSTNAME` - [optional] hostname to listen incoming connections on (default value: `localhost`)
- `HOST_URL` - Public facing Host URL
- `PROXY_REQUEST_TIMEOUT` - [optional] timeout for the proxy requests (default value: `30000`, 30s)
- `UPSTREAM_URL` - the upstream host URL (default value: none)
- `HEALTH_PATH` - [optional] health check api path (default value: `/_prxi_/health`)
- `LOGOIN_PATH` - [optional] end login endpoint path (default value: `/_prxi_/login`), when calling optional `redirectTo` query parameter can be passed to redirect user to given url after login
- `LOGOUT_PATH` - [optional] end session/logout path (default value: `/_prxi_/logout`)
- `LOG_LEVEL` - [optional] log level (default value: `info`)
- `LOG_FILE` - [optional] log file path (default value: `/prxi/logs/prxi-openid-connect.log`)
- `LOG_FILE_SIZE` - [optional] maximum log file size (default value: `10M`)
- `LOG_FILE_ROTATE` - [optional] maximum number of rotated filed (default value: `5`)
- `JWT_META_TOKEN_SECRET` - [optional] secret string to sign JWT with custom user meta attributes (if returned by the login webhook)

#### TLS Settings

Following environment variables allows dynamic configuration of TLS settings. For the whole list of options please refer to [https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options)

All the `<property>` values will be converted from snake_case to camelCase.

- `TLS_FILE_<property>` - Load file into a buffer from the provided path and set it to the `<property>` field
- `TLS_STRING_<property>` - Set string value into `<property>` field
- `TLS_NUMBER_<property>` - Set number value into `<property>` field

**Note:** when TLS is enabled upstream server should also support secure connection. Dynamic conversion from Secure to non-Secure connection is not supported. To accept self-signed certificate of the upstream service use `NODE_EXTRA_CA_CERTS` to set additional certificate.

#### OIDC settings
- `OPENID_CONNECT_DISCOVER_URL` - discovery URL, public endpoint to fetch openid-configuration from. E.g.:
  - For KeyCloak `https://{host}/realms/{realm}/.well-known/openid-configuration`
  - For AWS Cognito `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/openid-configuration`
- `OPENID_CALLBACK_PATH` - [optional] callback path, that Provider will call upon successful login to exchange code to tokens (default value: `/_prxi_/callback`)
- `OPENID_CLIENT_ID` - Client ID
- `OPENID_CLIENT_SECRET` - [optional] Client Secret
- `OPENID_SCOPE` - [optional] Scope of claims (default value: `openid email profile`)

#### Cookies
- `COOKIES_SECURE` - [optional] whether cookies are secured or not (default value: `true`)
- `COOKIES_PROXY_TO_UPSTREAM` - [optional] whether prxi-openid-connect specific cookies should be proxies to the upstream service (default value: `true`)
- `COOKIES_ACCESS_TOKEN` - [optional] Access Token cookie name (default value: `prxi-at`)
- `COOKIES_ID_TOKEN` - [optional] ID Token cookie name (default value: `prxi-it`)
- `COOKIES_REFRESH_TOKEN` - [optional] Refresh Token cookie name (default value: `prxi-rt`)
- `COOKIES_ORIGINAL_PATH` - [optional] Cookie name to hold originally request path, only applicable to the HTML page request (default value: `prxi-op`)
- `COOKIES_META` - [optional] Cookie name to hold meta information about the user, only used if login webhook returns `meta` object (default value: `prxi-meta`)

#### Mappings & JWT Claims Path

- `JWT_AUTH_CLAIM_PATHS` - [optional] JSON object representing paths (array of strings) to obtain mappings from both Auth/ID token payloads.
- `JWT_PROXY_CLAIM_PATHS` - [optional] JSON object representing paths (array of strings) to obtain mappings to extract from both Auth/ID token payloads. Value is passed as a JSON with the `HEADERS_CLAIMS_PROXY` header to the upstream service.

**Path example:**
-
```yaml
{
  # Every path should have a name.
  # Value is an array of string representing nested object fields starting from JWT payload
  # In this example payload.a.b.c will be used to access the claims array
  "name": [ "a", "b", "c" ]
}
```

- `MAPPINGS_PUBLIC` - [optional] represents JSON array with public facing path patterns (no authentication/authorization actions will be performed)
- `MAPPINGS_PAGES` - [optional] represents JSON array with web application pages, generally should refer to the endpoints that return HTML content, as in case of 401 error, proxy server will redirect user to the IDP login page.
- `MAPPINGS_API` - [optional] represents JSON array with API paths, works similar to `MAPPINGS_PAGES` but in case of 401 error server will respond with error:

```yaml
{
  "error": true,
  "details": {
    "message": "Unauthorized",
    "code": 401,
  }
}
```

- `MAPPINGS_WS` - [optional] represents JSON array with WS paths, works similar to `MAPPINGS_API`, but in case of 401 error server will respond with just the status code.

Mappings format:

```yaml
[
  # each mapping can have 0 or many mappings
  {
    # each mapping requires a RegEx pattern to match the path, note: ^ and $ characters can be omitted
    "pattern": "/public/.*",
    # [optional] define authorization rules
    # if "auth" is not provided, unauthorized access is allowed
    "auth": {
      # [optional] when "false", allows either unauthorized or a claims hit to GRANT access, default value "true", meaning only authorized access is allowed
      "required": false,

      # [optional] list of JWT claims to match over, note: when "auth.required" is true "auth.claims" should be provided too
      "claims": {
        # claims can reference one or many named paths (refer to the JWT_AUTH_CLAIM_PATHS environment variable configuration)
        "name": [
          # a hit on EITHER ONE of the claims will GRANT access to the resource
          "role1",
          "role2"
        ]
      }
    }
  }
]
```

It is highly recommended to intercept 401 errors on the Web Application side and reload the page, so `MAPPINGS_PAGES` mapping flow is triggered and user gets redirected to the login page.

#### Redirects
- `REDIRECT_PAGE_REQUEST_ON_403` - [optional] URL to redirect when access is forbidden
- `REDIRECT_PAGE_REQUEST_ON_404` - [optional] URL to redirect when no mapping found for requested path
- `REDIRECT_PAGE_REQUEST_ON_500` - [optional] URL to redirect when unexpected error occurred
- `REDIRECT_PAGE_REQUEST_ON_503` - [optional] URL to redirect when connection to the upstream service cannot be established

#### Headers

- `HEADERS_CLAIMS_AUTH_ALL` - [optional] header name to pass all the auth claims extracted from access/id tokens before calling the upstream service
- `HEADERS_CLAIMS_AUTH_MATCHING` - [optional] header name to pass just the matching auth claims extracted from access/id tokens before calling the upstream service
- `HEADERS_CLAIMS_PROXY` - [optional] header name to pass extracted attributes from both access and id tokens (useful to extract such information as username and/or email), definition of claims to pass should be described via `JWT_PROXY_CLAIM_PATHS` environment variable (see above)
- `HEADERS_INJECT_REQUEST` - [optional] JSON object of additional headers to apply to the request before calling the upstream service
- `HEADERS_INJECT_RESPONSE` - [optional] JSON object of additional headers to apply to the response

Example:
```yaml
{
  # null value removes the header from the request/response
  "Authorization": null,
  # non-null value adds/overrides header in the request/response
  "Content-Security-Policy": "default-src 'self'"
}
```

#### Webhooks
- `WEBHOOK_LOGIN_URL` - [optional]optional URL to make a POST request to, response should be a json object with the following optional fields
 - `refresh: boolean` - [optional] if true, service will use refresh token to fetch new set of tokens, might be useful when webhook endpoint updated user state and new set of tokens should be issued to a user
 - `reject: boolean` - [optional] if true, user won't get the tokens and will see an `Access denied` error
 - `reason: string` - [optional] reason to return instead of `Access denied`
 - `meta: Record<string, any>` - [optional] custom meta attributes associated to a user (make sure to use `JWT_META_TOKEN_SECRET` env variable to set secret and `HEADERS_META` to set the header name to proxy value in)
 - `redirectTo: string` - [optional] custom URL or relative path to redirect upon flow completion

## Links

- [Docker Image](https://hub.docker.com/r/fireblink/prxi-openid-connect) official Docker image
- [GitHub Repository](https://github.com/FireBlinkLTD/prxi-openid-connect)
- [@prixi/dev](https://www.npmjs.com/package/@prxi/dev) a simple CLI reverse proxy tool for local development purposes, can be handy to simulate fireblink/prxi-openid-connect setup without a need to run docker container and/or setup test IDP configuration

## License

This project is distributed under dual licensing.

### Quick Summary

This project can be used for free of charge for:
- Personal Uses
- Noncommercial Organizations

This project also provides **30** days of evaluation period for **commercial** products and services. After the evaluation period additional license should be obtained or project stopped from being used.

More can be found in [LICENSE.md](https://github.com/FireBlinkLTD/prxi-openid-connect/blob/main/LICENSE.md)

### Contact Information

To obtain a commercial license [click here](https://fireblink.com/#contact-us) to get in a contact.

## HTMX Support

Every time prxi-openid-connect needs to send a redirect it checks an incoming request to have the `Hx-Boosted` header. If header is found and its value is `true` then prxi-openid-connect will return `200` status code with [Hx-Redirect](https://htmx.org/reference/#response_headers) header instead of making a standard HTTP redirect.
