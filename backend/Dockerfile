FROM node:24-slim

# Run as the unprivileged "node" user (uid 1000) so files written into the
# bind-mounted source tree, like src/generated, aren't owned by root.
RUN mkdir /app && chown node:node /app
USER node
WORKDIR /app

COPY --chown=node:node package*.json ./
RUN npm ci

COPY --chown=node:node . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
