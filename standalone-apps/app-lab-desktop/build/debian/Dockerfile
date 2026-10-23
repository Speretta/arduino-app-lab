# Must satisfy the `go` directive in standalone-apps/app-lab-desktop/go.mod: the official
# golang images set GOTOOLCHAIN=local, so an older image refuses to build rather than fetch a
# newer toolchain. check_go_toolchain.sh (next to this file) enforces the pair on every PR and
# before every local .deb build.
FROM golang:1.26.3 AS go

ARG BINARY_NAME
RUN test -n "${BINARY_NAME}" || (echo "Error: BINARY_NAME is not set" && exit 1)
ARG VERSION
RUN test -n "${VERSION}" || (echo "Error: VERSION is not set" && exit 1)
ARG REVISION="1"
ARG ARCH
RUN test -n "${ARCH}" || (echo "Error: ARCH is not set" && exit 1)

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
	build-essential \
	libgtk-3-dev \
	libwebkit2gtk-4.1-dev \
	ca-certificates \
	curl \
	xz-utils

# Install a pinned Node.js version so the frontend build behaves consistently
# with the other platform builds.
ENV NODE_VERSION=26.1.0
ENV YARN_VERSION=4.18.0

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz" -o /tmp/node.tar.xz && \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && \
    rm /tmp/node.tar.xz && \
    node --version && npm --version
  
# Pin the wails CLI to exactly the wails/v2 version go.mod requires, derived from go.mod at
# build time so the two can never drift apart — the same anti-drift stance as the golang base
# image above. Only go.mod/go.sum land in this layer's input, so a source-only change does not
# re-run the install; the wails module is public, so no credentials are needed here.
COPY standalone-apps/app-lab-desktop/go.mod standalone-apps/app-lab-desktop/go.sum /tmp/wails-pin/
RUN cd /tmp/wails-pin && \
    WAILS_VERSION="$(go list -m -f '{{.Version}}' github.com/wailsapp/wails/v2)" && \
    test -n "${WAILS_VERSION}" && \
    go install "github.com/wailsapp/wails/v2/cmd/wails@${WAILS_VERSION}"

RUN npm install -g corepack && corepack enable && corepack prepare yarn@${YARN_VERSION} --activate

COPY . /app
WORKDIR /app

# The token stays in the secret mount and this RUN's environment. Yarn reads NPM_TOKEN from
# the environment before it ever looks at a .env file (dev-utils/dev-config/scripts/
# plugin-env-npm.js), so writing it to a file would only persist a live credential into this
# layer — the exact thing the BuildKit secret exists to prevent.
RUN --mount=type=secret,id=npm_token_id \
  export NPM_TOKEN=$(cat /run/secrets/npm_token_id) \
  && yarn install --immutable

WORKDIR /app/standalone-apps/app-lab-desktop
ENV GOOS=linux
ENV GOARCH=arm64
ENV CGO_ENABLED=1
# Private Go modules need the token on git's https fetches, but `git config --global` would
# write it into /root/.gitconfig, which this layer then keeps. GIT_CONFIG_* environment config
# is read by every git the Go toolchain spawns and never touches disk. The same goes for the
# frontend build wails runs: yarn takes NPM_TOKEN from the inherited environment.
RUN --mount=type=secret,id=npm_token_id \
  export NPM_TOKEN=$(cat /run/secrets/npm_token_id) \
  && GIT_CONFIG_COUNT=1 \
     GIT_CONFIG_KEY_0="url.https://${NPM_TOKEN}:x-oauth-basic@github.com/bcmi-labs.insteadOf" \
     GIT_CONFIG_VALUE_0="https://github.com/bcmi-labs" \
     wails build --devtools --platform linux/${ARCH} -tags webkit2_41 -webview2 download -o ${BINARY_NAME} -ldflags="-X 'main.version=${VERSION}'"

FROM debian:bookworm AS debian

ARG VERSION
RUN test -n "${VERSION}" || (echo "Error: VERSION is not set" && exit 1)
ARG ARCH
RUN test -n "${ARCH}" || (echo "Error: ARCH is not set" && exit 1)
ARG DEB_NAME
RUN test -n "${DEB_NAME}" || (echo "Error: DEB_NAME is not set" && exit 1)
ARG BINARY_NAME
RUN test -n "${BINARY_NAME}" || (echo "Error: BINARY_NAME is not set" && exit 1)
ARG REVISION="1"

RUN apt-get update && apt-get install -y sed

COPY ./standalone-apps/app-lab-desktop/build/debian/${DEB_NAME} /${DEB_NAME}/
# The copyright file is assembled by dev-utils/al-license/licensed.sh and
# gitignored, so a plain COPY of the tree happily omits it. Refuse to build a
# .deb without it: Debian policy requires the file, and local builds go
# straight onto boards via `yarn install:arduino-app-lab:deb`.
RUN test -s /${DEB_NAME}/usr/share/doc/arduino-app-lab/copyright \
  || (echo "copyright missing - run: yarn build-copyright:arduino-app-lab-desktop" && exit 1)
COPY --from=go /app/standalone-apps/app-lab-desktop/build/bin/${BINARY_NAME} /${DEB_NAME}/usr/bin/${BINARY_NAME}
COPY --from=go /app/standalone-apps/app-lab-desktop/internal/app/ArduinoAppLab.desktop /${DEB_NAME}/usr/share/applications/ArduinoAppLab.desktop

# # Go application are tagged with `v` prefix, this remove the first v if present
RUN export VERSION=$(echo "${VERSION}" | sed -e "s/^v\(.*\)/\1/") && \
  sed -i "s/\$ARCH/${ARCH}/" /${DEB_NAME}/DEBIAN/control && \
  sed -i "s/\$VERSION/${VERSION}/" /${DEB_NAME}/DEBIAN/control && \
  sed -i "s/\$VERSION/${VERSION}/" /${DEB_NAME}/usr/share/applications/ArduinoAppLab.desktop && \
  sed -i "s/\$BINARY_PATH/\/usr\/bin\/${BINARY_NAME}/" /${DEB_NAME}/usr/share/applications/ArduinoAppLab.desktop && \
  sed -i "s/\$WM_CLASS/${BINARY_NAME}/" /${DEB_NAME}/usr/share/applications/ArduinoAppLab.desktop && \
  sed -i "s/\$ICON/arduino-app-lab/" /${DEB_NAME}/usr/share/applications/ArduinoAppLab.desktop && \
  cp /${DEB_NAME}/usr/share/applications/ArduinoAppLab.desktop /${DEB_NAME}/etc/xdg/autostart/ArduinoAppLab.desktop && \
  dpkg-deb --build --root-owner-group /${DEB_NAME} && \
  mv /${DEB_NAME}.deb "/${DEB_NAME}_${VERSION}-${REVISION}_${ARCH}.deb"

FROM scratch

COPY --from=debian /*.deb /

