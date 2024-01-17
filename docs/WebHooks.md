# prxi-openid-connect WebHooks

Upon certain user actions, like login/logout prxi-openid-connect can make optional HTTP requests.

To enable specific Webhook request environment variable should be provided based on the table below.

| Name                 | Required | Description |
|----------------------|----------|-------------|
| `WEBHOOK_LOGIN_URL`  | No       | URL to make a `POST` request to upon user successful login |
| `WEBHOOK_LOGOUT_URL` | No       | URL to make a `POST` request to upon manual user logout action |

## Login Webhook

### Login Webhook Request

Request body is a JSON object with the following fields:

| Name           | Type       | Description |
|----------------|------------|-------------|
| `tokens`       | `TokenSet` | [TokenSet Structure](https://github.com/panva/node-openid-client/blob/main/docs/README.md#tokenset) |
| `originalPath` | `string`   | Original request path, e.g. `/a/b/c` |

### Login Webhook Response

Response should return 200 status code to be considered successful, in addition it may include a JSON object with the following fields:


| Name         | Type                  | Required | Default Value   | Description |
|--------------|-----------------------|----------|-----------------|-------------|
| `refresh`    | `boolean`             | No       | `false`         | If `true`, service will use refresh token to fetch new set of tokens, might be useful when webhook endpoint updated user state and new set of tokens should be issued to a user |
| `reject`     | `boolean`             | No       | `false`         | If `true`, user won't get the tokens and will see an `Access denied` error |
| `reason`     | `string`              | No       | `Access denied` | Reason of rejection |
| `meta`       | `Record<string, any>` | No       |                 | Custom meta attributes associated to a user (make sure to use `JWT_META_TOKEN_SECRET` env variable to set secret and `HEADERS_META` to set the header name to proxy value in) |
| `redirectTo` | `string`              | No       |                 |  Custom URL or relative path to redirect upon flow completion |

## Logout Webhook

Request body is a JSON object with the following fields

### Logout Webhook Request

Request body is a JSON object with the following fields:

| Name                    | Type       | Description |
|-------------------------|------------|-------------|
| `tokens`.`access_token` | `string`   | Access Token |
| `tokens`.`id_token`     | `string`   | Access Token |
| `meta`                  | unknown    | Meta information returned by the login webhook response (see above) |

### Logout Webhook Response

Response should return 2xx status code to be considered successful. Unlike the login webhook no response body is expected.
