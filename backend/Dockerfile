FROM node:22-alpine

WORKDIR /app/backend

COPY backend/package.json ./
COPY backend/prisma ./prisma

RUN npm install

COPY backend ./

RUN npm run prisma:generate && npm run build

EXPOSE 4000

CMD ["npm", "run", "start"]
