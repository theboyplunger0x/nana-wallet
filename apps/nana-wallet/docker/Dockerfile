FROM node:22.18-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG PARTICIPANT_IDENTITY=00000000-0000-4000-8000-000000000001
ENV VITE_API_URL=/api VITE_AGENT_BACKEND=true VITE_LIVEKIT_TOKEN_SOURCE=local
ENV VITE_LIVEKIT_PARTICIPANT_IDENTITY=$PARTICIPANT_IDENTITY
RUN npm run build:mobile

FROM nginx:1.28-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client /usr/share/nginx/html
EXPOSE 80
