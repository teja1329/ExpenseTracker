# Optional: backend dockerfile for local containerization
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
RUN apk add --no-cache sqlite
RUN sqlite3 /app/data/expense_app.db
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8081
CMD ["npm","start"]
