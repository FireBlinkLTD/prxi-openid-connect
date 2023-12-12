#!/bin/sh

#############
# VARIABLES #
#############

source ../.env

KC_CONTAINER_NAME=prixi-openidc-keycloak
KC_USERNAME=admin
KC_PASSWORD=admin
KC_SERVER_ADDRESS=http://localhost:8080
KC_AUTH_REALM=master

KC_TEST_REALM=test
KC_TEST_ROLE=test_role

KC_TEST_CLIENT=$OPENID_CLIENT_ID
KC_TEST_CLIENT_SECURE=${OPENID_CLIENT_ID}_secure
KC_TEST_CLIENT_SECRET=$OPENID_CLIENT_SECRET

##################
# WAITING FOR KC #
##################

echo "-> Waiting for Keycloak to boot"
count=0
until curl -s $KC_SERVER_ADDRESS > /dev/null
do
    count=$((count+1))
    if [[ count == 300 ]]; then
        echo '<- Keycloak boot timeout.'
        exit 1
    fi

    sleep 1
done
echo "<- Keycloak is up & running"

#####################
# UTILITY FUNCTIONS #
#####################

docker_exec() {
  docker exec -it $KC_CONTAINER_NAME "$@"
}

kc() {
  #echo "kcadm $@"
  docker_exec /opt/keycloak/bin/kcadm.sh "$@"
}

kc_setup() {
  kc config credentials \
    --server $KC_SERVER_ADDRESS \
    --realm $KC_AUTH_REALM \
    --user $KC_USERNAME \
    --password $KC_PASSWORD
}

############
# SETUP KC #
############

kc_setup

# Create new realm
echo "-> Creating new Realm \"$KC_TEST_REALM\""
kc create realms -s realm=$KC_TEST_REALM -s enabled=true

# Add new realm role
echo "-> Creating new Realm Role \"$KC_TEST_ROLE\""
kc create roles -r $KC_TEST_REALM -s name=$KC_TEST_ROLE -s 'description=Test role'

# Create user
echo "-> Creating new User \"$KC_TEST_USER\""
kc create users -s username=$KC_TEST_USER -s enabled=true -r $KC_TEST_REALM

# Setting user password
echo "-> Setting new password \"$KC_TEST_USER_PASSWORD\" for a User \"$KC_TEST_USER\""
kc set-password -r $KC_TEST_REALM --username $KC_TEST_USER --new-password $KC_TEST_USER_PASSWORD

# Assign user to realm role
echo "-> Assigning User \"$KC_TEST_USER\" to Realm Role \"$KC_TEST_ROLE\""
kc add-roles -r $KC_TEST_REALM --rolename $KC_TEST_ROLE --uusername $KC_TEST_USER

KC_CLIENT_CONFIG=$(cat << EOF
  {
    "clientId": "$KC_TEST_CLIENT",
    "rootUrl": "http://localhost:3000",
    "baseUrl": "/",
    "surrogateAuthRequired": false,
    "enabled": true,
    "alwaysDisplayInConsole": false,
    "clientAuthenticatorType": "client-secret",
    "secret": "$KC_TEST_CLIENT_SECRET",
    "redirectUris": ["/_prxi_/callback"],
    "webOrigins": ["+"],
    "bearerOnly": false,
    "consentRequired": false,
    "standardFlowEnabled": true,
    "implicitFlowEnabled": false,
    "directAccessGrantsEnabled": false,
    "serviceAccountsEnabled": false,
    "publicClient": false,
    "frontchannelLogout": false,
    "protocol": "openid-connect",
    "defaultClientScopes": ["web-origins","role_list","roles","profile","email"],
    "optionalClientScopes": ["address","phone","offline_access","microprofile-jwt"]
  }
EOF
)

# Create client with client secret
echo "-> Creating /tmp/client_config.json"
echo "$KC_CLIENT_CONFIG" > /tmp/client_config.json
docker cp /tmp/client_config.json $KC_CONTAINER_NAME:/tmp/client_config.json
rm /tmp/client_config.json
echo "-> Using /tmp/client_config.json to create new client"
kc create clients -r $KC_TEST_REALM -f /tmp/client_config.json


KC_CLIENT_SECURE_CONFIG=$(cat << EOF
  {
    "clientId": "$KC_TEST_CLIENT_SECURE",
    "rootUrl": "https://localhost:3000",
    "baseUrl": "/",
    "surrogateAuthRequired": false,
    "enabled": true,
    "alwaysDisplayInConsole": false,
    "clientAuthenticatorType": "client-secret",
    "secret": "$KC_TEST_CLIENT_SECRET",
    "redirectUris": ["/_prxi_/callback"],
    "webOrigins": ["+"],
    "bearerOnly": false,
    "consentRequired": false,
    "standardFlowEnabled": true,
    "implicitFlowEnabled": false,
    "directAccessGrantsEnabled": false,
    "serviceAccountsEnabled": false,
    "publicClient": false,
    "frontchannelLogout": false,
    "protocol": "openid-connect",
    "defaultClientScopes": ["web-origins","role_list","roles","profile","email"],
    "optionalClientScopes": ["address","phone","offline_access","microprofile-jwt"]
  }
EOF
)

# Create client with client secret
echo "-> Creating /tmp/client_config.json"
echo "$KC_CLIENT_SECURE_CONFIG" > /tmp/client_config.json
docker cp /tmp/client_config.json $KC_CONTAINER_NAME:/tmp/client_config.json
rm /tmp/client_config.json
echo "-> Using /tmp/client_config.json to create new client"
kc create clients -r $KC_TEST_REALM -f /tmp/client_config.json

echo "<- Keycloak setup completed"
