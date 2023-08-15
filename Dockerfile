ARG NODE_TAG=18.17.0-alpine

# prepare dev dependencies
FROM node:${NODE_TAG} as DEV_DEPENDENCIES
COPY package.json package.json
COPY yarn.lock yarn.lock
RUN yarn install

# prepare prod dependencies
FROM node:${NODE_TAG} as PROD_DEPENDENCIES
COPY package.json package.json
COPY yarn.lock yarn.lock
COPY --from=DEV_DEPENDENCIES node_modules node_modules
RUN yarn install --prod

# build app
FROM node:${NODE_TAG} as BUILD
COPY tsconfig.json tsconfig.json
COPY package.json package.json
COPY src src
COPY --from=DEV_DEPENDENCIES node_modules node_modules
RUN yarn build

# prepare final image
FROM node:${NODE_TAG}
WORKDIR /prxi

RUN apk add --no-cache tini

COPY package.json package.json
COPY .rotate.js .rotate.js

COPY --from=PROD_DEPENDENCIES node_modules node_modules
RUN mkdir dist
COPY --from=BUILD dist dist/src

ENTRYPOINT ["tini", "--"]
CMD ["npm", "start"]

