FROM denoland/deno:ubuntu

# The port that your application listens to.
EXPOSE 8080
# ENV LD_LIBRARY_PATH /usr/lib:/usr/local/lib
RUN apt-get update && apt-get -y install ffmpeg ca-certificates

WORKDIR /app

ARG YOUTUBEUPLOADER_VERSION="1.24.4"
WORKDIR /tmp
ADD https://github.com/porjo/youtubeuploader/releases/download/v${YOUTUBEUPLOADER_VERSION}/youtubeuploader_${YOUTUBEUPLOADER_VERSION}_Linux_amd64.tar.gz youtubeuploader.tar.gz
RUN tar -xvzf youtubeuploader.tar.gz
RUN cp youtubeuploader /usr/bin/youtubeuploader
# RUN rm -rf /tmp


WORKDIR /app

# Prefer not to run as root.
COPY ./deno.json ./deno.lock ./package.json ./package-lock.json ./
RUN deno install
# These steps will be re-run upon each file change in your working directory:
COPY ./src ./src
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno task build
ENTRYPOINT [ "/app/build/main" ]
