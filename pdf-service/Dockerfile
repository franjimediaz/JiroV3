FROM node:20-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json* ./

# Si usas npm:
RUN npm install

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm","start"]
