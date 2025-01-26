FROM denoland/deno:alpine

# The port that your application listens to.
EXPOSE 8080

WORKDIR /app

ARG YOUTUBEUPLOADER_VERSION="1.24.4"
WORKDIR /tmp
ADD https://github.com/porjo/youtubeuploader/releases/download/v${YOUTUBEUPLOADER_VERSION}/youtubeuploader_${YOUTUBEUPLOADER_VERSION}_Linux_amd64.tar.gz youtubeuploader.tar.gz
RUN tar -xvzf youtubeuploader.tar.gz
RUN cp youtubeuploader /app/youtubeuploader
# RUN rm -rf /tmp


WORKDIR /app

# Prefer not to run as root.
COPY ./deno.json .
COPY ./deno.lock .
RUN deno install
# These steps will be re-run upon each file change in your working directory:
COPY ./src ./src
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno task build
ENTRYPOINT [ "/app/build/main" ]
