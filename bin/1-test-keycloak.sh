#!/bin/sh
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# navigate 1 level up the script dir
cd "$SCRIPT_DIR/.."

# start docker compose
docker-compose up -d --build

# init keycloak
cd bin
bash ./0-init-keycloak.sh
cd ..

# generate keys
yarn keygen

export PATH_CERT=test/cert.pem
export PATH_KEY=test/key.pem

dev-echo-server &
echoPID=$!
sleep 1

# run tests
export NODE_ENV=test
yarn test
code=$?

kill $echoPID

# stop docker-compose
docker-compose down

exit $code
