# @prxi/openid-connect

OpenID Connect reverse proxy server that based on a zero-dependency proxy library [prxi](https://www.npmjs.com/package/prxi).

## Configuration

### Environment Variables

#### Generic settings
- `PORT` - port number to listen (default value: `3000`)
- `HOSTNAME` - hostname to listen incoming connections on (default value: `localhost`)
- `HOST_URL` - Public facing Host URL
- `PROXY_REQUEST_TIMEOUT` - timeout for the proxy requests (default value: `30000`, 30s)
- `UPSTREAM_URL` - the upstream host URL (default value: none)
- `HEALTH_PATH` - health check api PATH (default value: `/_prxi_/health`)
- `LOG_LEVEL` - log level (default value: `info`)
- `LOG_FILE` - log file path (default value: `/prxi/logs/prxi-openid-connect.log`)
- `LOG_FILE_SIZE` - maximum log file size (default value: `10M`)
- `LOG_FILE_ROTATE` - maximum number of rotated filed (default value: `5`)


#### OIDC settings
- `OPENID_CONNECT_DISCOVER_URL` - discovery URL, public endpoint to fetch openid-configuration from. E.g.:
  - For KeyCloak `https://{host}/realms/{realm}/.well-known/openid-configuration`
  - For AWS Cognito `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/openid-configuration`
- `OPENID_CALLBACK_PATH` - optional callback path, that Provider will call upon successful login to exchange code to tokens (default value: `/_prxi_/callback`)
- `OPENID_CLIENT_ID` - Client ID
- `OPENID_CLIENT_SECRET` - Client Secret
- `OPENID_SCOPE` - Scope of claims (default value: `openid email profile`)

#### Cookies
- `COOKIES_SECURE` - whether cookies are secured or not (default value: `true`)
- `COOKIES_ACCESS_TOKEN` - Access Token cookie name
- `COOKIES_ID_TOKEN` - ID Token cookie name
- `COOKIES_REFRESH_TOKEN` - Refresh Token cookie name
- `COOKIES_ORIGINAL_PATH` - Cookie name to hold originally request path, only applicable to the HTML page request

#### Mappings & JWT Claims Path
- `MAPPINGS_PUBLIC`
- `MAPPINGS_API`
- `MAPPINGS_PAGES`
- `JWT_CLAIM_PATHS`

#### Redirects
- `REDIRECT_PAGE_REQUEST_ON_404` - optional URL to redirect when no mapping found for requested path
- `REDIRECT_PAGE_REQUEST_ON_403` - optional URL to redirect when no access is denied, as none of the JWT claims matching mappings


#### Webhooks
- `WEBHOOK_LOGIN_URL` - optional URL to make a POST request to, response should be a json object with the following optional fields
  - `refresh: boolean` - if true, service will use refresh token to fetch new set of tokens, might be useful when webhook endpoint updated user state and new set of tokens should be issued to a user
  - `reject: boolean` - if true, user won't get the tokens and will see an `Access denied` error
  - `reason: string` - optional reason to return instead of `Access denied`
