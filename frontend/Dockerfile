# Базовый образ с Nginx для статических файлов
FROM nginx:alpine

# Копируем статические файлы фронтенда
COPY . /usr/share/nginx/html

# Открываем порт 80
EXPOSE 80

# Nginx запускается автоматически