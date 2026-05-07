FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# npm install (não ci) — primeiro boot ainda não tem package-lock.json
RUN npm install --no-audit --no-fund --legacy-peer-deps

FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev"]
