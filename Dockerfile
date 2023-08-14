ARG TINI_VERSION=v0.19.0
ARG NODE_TAG=18.17.0-alpine


# prepare tini
FROM node:${NODE_TAG} as PREPARE_TINI
ARG TINI_VERSION
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

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
RUN yarn build && \
  rm -rf dist/test

# prepare final image
FROM node:${NODE_TAG}

WORKDIR /prxi

COPY package.json package.json
COPY --from=PREPARE_TINI /tini /tini
COPY --from=PROD_DEPENDENCIES node_modules node_modules
COPY --from=BUILD dist dist
COPY .rotate.js .rotate.js

ENTRYPOINT ["/tini", "--"]
CMD ["npx", "start"]

