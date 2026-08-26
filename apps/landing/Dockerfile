# Etapa 1: compilar el CSS (tailwindcss CLI, sin CDN en tiempo real)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tailwindcss -i src/input.css -o styles.css --minify

# Etapa 2: servir con nginx
FROM nginx:1.27-alpine
COPY index.html            /usr/share/nginx/html/index.html
COPY --from=builder /app/styles.css /usr/share/nginx/html/styles.css
COPY logos/     /usr/share/nginx/html/logos/
COPY icons/     /usr/share/nginx/html/icons/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
