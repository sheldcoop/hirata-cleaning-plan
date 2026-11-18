# Hirata Cleaning Plan - static web server for ProKube (Knative).
# Serves the app files on port 8080. The plan data is NOT in the container:
# each PC still connects the shared data folder once (same as opening it from the share).
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY tests/index.html tests/harness.js tests/memory-storage.js tests/rules.test.js tests/store.test.js /usr/share/nginx/html/tests/
EXPOSE 8080
