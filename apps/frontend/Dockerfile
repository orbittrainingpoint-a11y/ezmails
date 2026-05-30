# ezmails frontend — build the SPA, then serve static files via nginx.
FROM node:20-alpine AS build
WORKDIR /app
# Secret base path the admin panel is mounted under (e.g. /control-a7f3k9).
# Empty during local builds → admin stays at "/". Set by docker-compose at deploy.
ARG VITE_ADMIN_BASE=""
ENV VITE_ADMIN_BASE=$VITE_ADMIN_BASE
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.25-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
