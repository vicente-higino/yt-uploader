FROM denoland/deno:alpine AS build

WORKDIR /app

# Prefer not to run as root.
COPY ./deno.json ./deno.lock ./package.json ./package-lock.json ./
RUN deno install
# These steps will be re-run upon each file change in your working directory:
COPY ./src ./src
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno task build

FROM jrottenberg/ffmpeg:7.1-ubuntu

RUN apt-get update && apt-get -y install ca-certificates

ARG YOUTUBEUPLOADER_VERSION="1.24.4"
WORKDIR /tmp
ADD https://github.com/porjo/youtubeuploader/releases/download/v${YOUTUBEUPLOADER_VERSION}/youtubeuploader_${YOUTUBEUPLOADER_VERSION}_Linux_amd64.tar.gz youtubeuploader.tar.gz
RUN tar -xvzf youtubeuploader.tar.gz && cp youtubeuploader /usr/bin/youtubeuploader && rm ./*

WORKDIR /app
COPY --from=build /app/build/main /app/main

# The port that your application listens to.
EXPOSE 8080

ENTRYPOINT [ "/app/main" ]
