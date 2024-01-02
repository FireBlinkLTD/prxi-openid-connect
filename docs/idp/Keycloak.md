# KeyCloak configuration example

## Client Configuration

```bash
# KeyCloak discovery URL to fetch client configuration from
# <host> should be replaced with an actual Keycloak host
# <realm> should be replaced with the realm name, by default KC creates "master" realm
OPENID_CONNECT_DISCOVER_URL='https://<host>/realms/<realm>/.well-known/openid-configuration'
# client id
OPENID_CLIENT_ID='<client id>'
# client secret
OPENID_CLIENT_SECRET='<client secret>'

# Information on where to extract realm and client specific roles
# <client id> should be replaced with an actual client ID
JWT_AUTH_CLAIM_PATHS='{
  "realm": ["realm_access", "roles"],
  "client": ["resource_access", "<client id>", "roles"]
}'
```

## Mappings

```yaml
{
  # RegEx pattern
  "pattern": ".*",

  "auth": {
    # require all roles to be presented, as by default mode is "ANY", meaning any of the specified roles grant user access
    "mode": "ALL",

    # allowed JWT claims
    "claims": {
      # allowed realm roles
      "realm": [ "<realm-role>" ],
      # allowed client roles
      "client": [ "<client-role>" ],
    }
  }
}
```
