FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY logos/     /usr/share/nginx/html/logos/
COPY icons/     /usr/share/nginx/html/icons/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
