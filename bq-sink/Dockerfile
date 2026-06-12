FROM node:20-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --no-audit --no-fund --omit=dev
COPY --from=builder /app/dist ./dist
# Avro schema shared with the producer — required for Schema Tracking
COPY merch-checkout-event.avsc ./

# dd-trace is loaded via -r dd-trace/init in the start script
CMD ["node", "-r", "dd-trace/init", "dist/index.js"]
