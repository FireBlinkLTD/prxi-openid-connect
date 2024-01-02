# AWS Cognito

## Client Configuration

```bash
# KeyCloak discovery URL to fetch client configuration from
# <region> should be replaced with an actual AWS Region where User Pool is located
# <pool id> should be replaced with the AWS Cognito User Pool ID
OPENID_CONNECT_DISCOVER_URL='https://cognito-idp.<region>.amazonaws.com/<pool id>/.well-known/openid-configuration'
# client id
OPENID_CLIENT_ID='<client id>'
# client secret
OPENID_CLIENT_SECRET='<client secret>'

# Information on where to extract cognito user groups
JWT_AUTH_CLAIM_PATHS='{
  "groups": ["cognito:groups"]
}'
```

## Mappings

```yaml
{
  # RegEx pattern
  "pattern": ".*",

  "auth": {
    # allowed JWT claims
    "claims": {
      # allowed groups
      "groups": [ "<group name>" ]
    }
  }
}
```
