FROM denoland/deno:bin-2.0.0 AS deno
FROM mcr.microsoft.com/devcontainers/typescript-node:20
COPY --from=deno /deno /usr/local/bin/deno
ENV LD_LIBRARY_PATH /usr/lib:/usr/local/lib
RUN apt-get -y update && apt-get -y upgrade && apt-get install -y --no-install-recommends ffmpeg
