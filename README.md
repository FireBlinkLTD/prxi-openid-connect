# fireblink/prxi-openid-connect

[OpenID Connect reverse proxy server](https://hub.docker.com/r/fireblink/prxi-openid-connect) that based on a zero-dependency proxy library [prxi](https://www.npmjs.com/package/prxi).

Can be used to provide SSO login (Authentication/Authorization) functionality to any web application or API service, or both at the same time.
In most of the cases prxi-openid-connect should be deployed in front of your application to intercept all the requests:

<img src="docs/assets/prxi-openid-connect.png" width="640">

Proxy will handle authentication and authorization for individual path mappings, by allowing access only if JWT token contains allowed claims.

Proxy clearly distinguish API and HTML requests, so when access token expires (and can't be refreshed) or missing API request won't return HTML of the login page, but a JSON error object and correct http status code (401). The same applies to a case when access is denied for a user for requested resource (403 error)

In addition upon every login, logout or token refresh action prxi-openid-connect can call optional webhook endpoints and even change the flow based on the response. This might be handy to track audit logs, request token refresh one more time, etc.

## Configuration

### Environment Variables

#### Generic settings

| Name                    | Required | Default Value | Description |
|-------------------------|----------|---------------|-------------|
| `LICENSE_CONSENT`       | Yes      |               | `true` value should be provided when you agree to use prxi-openid-connect under the current license terms. Please refer to the [License](#license) for more details |
| `MODE`                  | No       | `HTTP`        | Server mode, can be either `HTTP` or `HTTP2` (default value: `HTTP`). Note: when HTTP/2 is enabled, upstream should also support it, dynamic conversion from HTTP/2 to HTTP/1.1 is not supported. |
| `PORT`                  | No       | `3000`        | Port number to listen the incoming connections on |
| `HOSTNAME`              | No       | `localhost`   | Hostname to listen incoming connections on |
| `HOST_URL`              | Yes      |               | Public facing Host URL |
| `PROXY_REQUEST_TIMEOUT` | No       | `30000`       | Timeout for the proxy requests |
| `UPSTREAM_URL`          | Yes      |               | Upstream URL |
| `JWT_META_TOKEN_SECRET` | No       |               | Secret string to sign JWT with custom user meta attributes (if returned by the login webhook) |

#### Logs

| Name                      | Required | Default Value      | Description |
|---------------------------|----------|--------------------|-------------|
| `LOG_LEVEL`               | No       | `info`             | Log level |
| `LOG_FILE`                | No       |                    | Log file path |
| `LOG_ROTATE_DATE_PATTERN` | No       | `YYYY-MM-DD_HH` | Log rotation `%DATE%` format |
| `LOG_ROTATE_MAX_SIZE`     | No       | `100m`              | Maximum size of the file after which it will rotate. This can be a number of bytes, or units of kb, mb, and gb. If using the units, add 'k', 'm', or 'g' as the suffix. The units need to directly follow the number. |
| `LOG_ROTATE_MAX_FILES`    | No       | `5`                | Maximum number of logs to keep. If not set, no logs will be removed. This can be a number of files or number of days. If using days, add 'd' as the suffix. It uses auditFile to keep track of the log files in a json format. It won't delete any file not contained in it. It can be a number of files or number of days |
| `LOG_PRETTY`              | No       | `false`            | If set to `true`, human readable formatting will be used instead of a JSON |

#### Prxi Request Paths

| Name                    | Required | Default Value     | Description |
|-------------------------|----------|-------------------|-------------|
| `HEALTH_PATH`           | No       | `/_prxi_/health`  | Health check api path |
| `LOGIN_PATH`            | No       | `/_prxi_/login`   | Login endpoint path. When calling, optional `redirectTo` query parameter can be passed to redirect user to a given url after login |
| `LOGOUT_PATH`           | No       | `/_prxi_/logout`  | End session/logout path |

#### TLS Settings

Following environment variables allows dynamic configuration of TLS settings. For the whole list of options please refer to [https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options)

All the `<property>` values will be converted from snake_case to camelCase.

| Name                    | Required | Default Value | Description |
|-------------------------|----------|---------------|-------------|
| `TLS_FILE_<property>`   | No       |               | Load file into a buffer from the provided path and set it to the `<property>` field |
| `TLS_STRING_<property>` | No       |               | Set string value into `<property>` field |
| `TLS_NUMBER_<property>` | No       |               | Set number value into `<property>` field |

**Note:** when TLS is enabled upstream server should also support secure connection. Dynamic conversion from Secure to non-Secure connection is not supported. To accept self-signed certificate of the upstream service use `NODE_EXTRA_CA_CERTS` to set additional certificate.

#### OIDC settings

| Name                          | Required | Default Value          | Description |
|-------------------------------|----------|------------------------|-------------|
| `OPENID_CONNECT_DISCOVER_URL` | Yes      |                        | Discovery URL, public endpoint to fetch openid-configuration from |
| `OPENID_CALLBACK_PATH`        | No       | `/_prxi_/callback`     | Callback path that Provider will call upon successful login to exchange code to tokens |
| `OPENID_CLIENT_ID`            | Yes      |                        | Client ID |
| `OPENID_CLIENT_SECRET`        | No       |                        | Client Secret |
| `OPENID_SCOPE`                | No       | `openid email profile` | Scope of the claims |

Discovery URL examples (`OPENID_CONNECT_DISCOVER_URL`):
- For KeyCloak `https://{host}/realms/{realm}/.well-known/openid-configuration`
- For AWS Cognito `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/openid-configuration`

#### Cookies

| Name                        | Required | Default Value | Description |
|-----------------------------|----------|---------------|-------------|
| `COOKIES_SECURE`            | No       | `true`        | A cookie Secure attribute |
| `COOKIES_PROXY_TO_UPSTREAM` | No       | `true`        | Whether prxi-openid-connect specific cookies should be proxies to the upstream service
| `COOKIES_ACCESS_TOKEN`      | No       | `prxi-at`     | Access Token cookie name |
| `COOKIES_ID_TOKEN`          | No       | `prxi-it`     | ID Token cookie name |
| `COOKIES_REFRESH_TOKEN`     | No       | `prxi-rt`     | Refresh Token cookie name |
| `COOKIES_ORIGINAL_PATH`     | No       | `prxi-op`     | Cookie name to hold originally request path, only applicable to the HTML page request |
| `COOKIES_META`              | No       | `prxi-meta`   | Cookie name to hold meta information about the user, only used if login webhook returns `meta` object |

#### Mappings & JWT Claims Path

| Name                        | Required | Default Value | Description |
|-----------------------------|----------|---------------|-------------|
| `JWT_AUTH_CLAIM_PATHS` | No | | JSON object representing paths (array of strings) to obtain mappings from both Auth/ID token payloads. |
| `JWT_PROXY_CLAIM_PATHS`| No | | JSON object representing paths (array of strings) to obtain mappings to extract from both Auth/ID token payloads. Value is passed as a JSON with the `HEADERS_CLAIMS_PROXY` header to the upstream service and returned by the ["Who am I?" API](https://github.com/FireBlinkLTD/prxi-openid-connect/blob/main/docs/API.md#who-am-i). General usecase is to extract user related information like username, email, given name, etc. |

**Path example:**

```yaml
{
  # Every path should have a name.
  # Value is an array of string representing nested object fields starting from JWT payload
  # In this example payload.a.b.c will be used to access the claims array
  "name": [ "a", "b", "c" ]
}
```

| Name              | Required | Default Value | Description |
|-------------------|----------|---------------|-------------|
| `MAPPINGS_PUBLIC` | No       |               | JSON array with public facing path patterns (no authentication/authorization actions will be performed) |
| `MAPPINGS_PAGES`  | No       |               | JSON array with web application pages, generally should refer to the endpoints that return HTML content, as in case of 401 error, proxy server will redirect user to the IDP login page. |
| `MAPPINGS_WS`     | No       |               | JSON array with WS paths, works similar to `MAPPINGS_API`, but in case of 401 error server will respond with just the status code. |
| `MAPPINGS_API`    | No       |               | JSON array with API paths, works similar to `MAPPINGS_PAGES` but in case of 401 error server will respond with an error. |

Error example:

```yaml
{
  "error": true,
  "details": {
    "message": "Unauthorized",
    "code": 401,
  }
}
```

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

| Name                           | Required | Default Value | Description |
|--------------------------------|----------|---------------|-------------|
| `REDIRECT_PAGE_REQUEST_ON_403` | No       |               | URL to redirect when access is forbidden |
| `REDIRECT_PAGE_REQUEST_ON_404` | No       |               | URL to redirect when no mapping found for requested path |
| `REDIRECT_PAGE_REQUEST_ON_500` | No       |               | URL to redirect when unexpected error occurred |
| `REDIRECT_PAGE_REQUEST_ON_503` | No       |               | URL to redirect when connection to the upstream service cannot be established |

#### Headers

| Name                           | Required | Default Value | Description |
|--------------------------------|----------|---------------|-------------|
| `HEADERS_CLAIMS_AUTH_ALL`      | No       |               | Header name to pass all the auth claims extracted from access/id tokens before calling the upstream service |
| `HEADERS_CLAIMS_AUTH_MATCHING` | No       |               | Header name to pass just the matching auth claims extracted from access/id tokens before calling the upstream service |
| `HEADERS_CLAIMS_PROXY`         | No       |               | Header name to pass extracted attributes from both access and id tokens (useful to extract such information as username and/or email), definition of claims to pass should be described via `JWT_PROXY_CLAIM_PATHS` environment variable (see above) |
| `HEADERS_INJECT_REQUEST`       | No       |               | JSON object of additional headers to apply to the request before calling the upstream service |
| `HEADERS_INJECT_RESPONSE`      | No       |               | JSON object of additional headers to apply to the response |

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

prxi-openid-connect can optionally make [WebHook requests](https://github.com/FireBlinkLTD/prxi-openid-connect/blob/main/docs/WebHooks.md) upon certain user action, like login and/or logout.

#### APIs

prxi-openid-connect can optionally expose additional [API endpoint](https://github.com/FireBlinkLTD/prxi-openid-connect/blob/main/docs/API.md). Such APIs help to provide better UX, e.g. by hiding menu options that user can't access due to the permission restrictions.

#### Remote configuration

One of the key features of prxi-openid-connect is the ability to load configuration from the remote instance and refresh it periodically. To obtain the admin application[click here](https://fireblink.com/#contact-us) to get in contact for the commercial agreement.

| Name | Required | Default Value | Description |
|---|---|---|---|
| `REMOTE_CONFIGURATION_ENABLED` | No | `false` | Set to `true to enable remote configuration loading |
| `REMOTE_CONFIGURATION_INTERVAL` | No | `30` | Time interval in seconds to load the configuration from the remote service |
| `REMOTE_CONFIGURATION_ENDPOINT` | No | | Endpoint to load the configuration from |
| `REMOTE_CONFIGURATION_TOKEN` | Yes | | Bearer token to include in the request |

## Upstream Headers

Upstream service may respond with custom headers to control the prxi-openid-connect behavior.

| Name                    | Value | Description |
|-------------------------|-------|-------------|
| `X-Prxi-Refresh-Tokens` | any   | When header is returned by the upstream service, prxi-openid-connect will refresh any existing tokens (access/id) |

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
