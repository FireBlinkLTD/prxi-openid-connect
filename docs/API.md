# prxi-openid-connect API

All the API endpoints are turned off by default. Each should be enabled individually by providing the path via environment variable.
All the API endpoint are invoked before

## Who am I?

An API endpoint that helps to extract user related information from Auth and ID tokens.

Environment variable: `WHOAMI_API_PATH`, example: `/_/api/whoami`

`GET` request to the provided path will return the JSON response that will contain the following information:

```yaml
{
  # flag to determine if user is authenticated or not
  "anonymous": false,
  "claims": {
    # all the claims retrieved from Access and ID tokens based on the JWT_AUTH_CLAIM_PATHS configuration
    "auth": {
      # ...
    },
    # all the claims retrieved from Access and ID tokens based on the JWT_PROXY_CLAIM_PATHS configuration
    "proxy": {
      # ...
    },
  },

  # optional field, returns the meta information set by the webhook API upon the login action
  "meta": {}
}
```

When user is not authenticated API response will look like the following:

```yaml
{
  "anonymous": true,
  "claims": {
    "auth": {},
    "proxy": {}
  }
}
```

## Permissions

An API endpoint that allows to check user permissions on specific resources.

Environment variable: `PERMISSIONS_API_PATH`, example: `/_/api/whoami`

`POST` request with an array of interested resources is expected in the body:

```yaml
[
  {
    # resource path
    "path": "/a/b/c",
    # resource method, GET, PUT, POST, PATCH, DELETE
    "method": "GET"
  }
]
```

Response:

```yaml
{
  # flag to determine if user is authenticated or not
  "anonymous": true,
  # list of the resources included in the request
  "resources": [
    {
      # access allowance flag
      "allowed": true,
      # resource path
      "path": "/a/b/c",
      # resource method
      "method": "GET"
    }
  ]
}
```
