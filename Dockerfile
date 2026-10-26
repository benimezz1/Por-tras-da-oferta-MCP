FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3100
CMD ["node", "src/server.mjs"]
