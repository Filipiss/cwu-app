# docker/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY backend/ ./backend/
COPY frontend/ ./frontend/

EXPOSE 4321

WORKDIR /app/backend

CMD ["node", "server.js"]
