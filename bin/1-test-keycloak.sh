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

# run tests
yarn test

# stop docker-compose
docker-compose down


