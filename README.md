# @prxi/openid-connect

OpenID Connect reverse proxy server that based on a zero-dependency proxy library [prxi](https://www.npmjs.com/package/prxi).

## Configuration

### Environment Variables

- `PORT` - port number to listen (default value: `3000`)
- `HOSTNAME` - hostname to listen incoming connections on (default value: `localhost`)
- `PROXY_REQUEST_TIMEOUT` - timeout for the proxy requests (default value: `30000`)
- `UPSTREAM_URL` - the upstream host URL (default value: none)
- `HEALTH_PATH` - health check api PATH (default value: `/_prxi_/health`)
- `LOG_LEVEL` - log level (default value: `info`)
