#!/usr/bin/env bash

PROJECT_ROOT=$(cd "$(git rev-parse --show-toplevel)" && pwd)
NODE_VERSION='v26.1.0'
YARN_VERSION='4.18.0'

ENGINES_DIR=$PROJECT_ROOT/__engines__

if [ ! -d "$ENGINES_DIR" ]; then
    mkdir -p $ENGINES_DIR
fi

set_PATH() {
    app_bin_path=$1
    case "${app_bin_path}" in
    *${PATH}*)
        echo PATH already includes ${app_bin_path}
        ;;
    *)
        PATH=${app_bin_path}:$PATH
        echo Updated PATH to include ${app_bin_path}
        ;;
    esac
}

# Point link_path at the target folder. Git Bash without Developer Mode copies
# instead of linking, and a later ln -nsf then puts the new version inside the
# copy instead of replacing it. A copy therefore records in .engine-release the
# target it was made from, and is replaced only when that changes. The copy is
# made under a temporary name and moved into place last, so a copy that failed
# or was interrupted never carries a marker.
link_dir() {
    local target=$1
    local link_path=$2
    local staging="${link_path}.new.$$"
    local current=""

    # A failed download leaves no target: keep what works until one exists.
    if [ ! -d "${target}" ]; then
        return 0
    fi

    if [ -L "${link_path}" ]; then
        ln -nsf "${target}" "${link_path}"
        return 0
    fi
    if [ -f "${link_path}/.engine-release" ]; then
        read -r current <"${link_path}/.engine-release"
    fi
    if [ "${current}" = "${target}" ]; then
        return 0
    fi

    rm -rf "${staging}"
    if ! ln -s "${target}" "${staging}"; then
        rm -rf "${staging}"
        return 0
    fi
    if [ ! -L "${staging}" ]; then
        echo "${target}" >"${staging}/.engine-release"
    fi

    # A file Windows has locked makes the delete fail part way.
    if ! rm -rf "${link_path}"; then
        echo "setup-dev-env: cannot replace ${link_path}; close what runs from it, then open a new shell" >&2
        rm -rf "${staging}"
        return 0
    fi
    # Another shell may have finished first, and mv would put this copy inside it.
    if [ -e "${link_path}" ]; then
        rm -rf "${staging}"
        return 0
    fi
    mv "${staging}" "${link_path}"
}

prepare_node() {
    local architecture uname_out node_release node_archive

    case $(uname -m) in
    arm*  | aarch64) architecture="arm64" ;;
    *) architecture="x64" ;;
    esac

    uname_out="$(uname -s)"
    case "${uname_out}" in
    Linux*) system=Linux ;;
    Darwin*) system=Mac ;;
    CYGWIN*) system=Windows ;;
    MINGW*) system=Windows ;;
    esac

    case "${system}" in
    Linux*)
        node_release="node-${NODE_VERSION}-linux-${architecture}"
        node_archive="${node_release}.tar.xz"
        ;;
    Mac*)
        node_release="node-${NODE_VERSION}-darwin-${architecture}"
        node_archive="${node_release}.tar.xz"
        ;;
    Windows*)
        node_release="node-${NODE_VERSION}-win-${architecture}"
        node_archive="${node_release}.zip"
        ;;
    *)
        echo "setup-dev-env not supported for ${uname_out}"
        exit 1
        ;;
    esac

    if [ ! -d "${ENGINES_DIR}/${node_release}" ]; then
        if curl -fL -o "${ENGINES_DIR}/${node_archive}" "https://nodejs.org/download/release/${NODE_VERSION}/${node_archive}"; then
            case $node_archive in
            *.tar.xz) tar -xJf "${ENGINES_DIR}/${node_archive}" -C $ENGINES_DIR/ ;;
            *.zip) unzip "${ENGINES_DIR}/${node_archive}" -d $ENGINES_DIR/ ;;
            esac
        fi

        rm -f "${ENGINES_DIR}/${node_archive}"
    fi

    case "${system}" in
    Windows*) link_dir "${ENGINES_DIR}/${node_release}" "${ENGINES_DIR}/node_bin" ;;
    *) link_dir "${ENGINES_DIR}/${node_release}/bin" "${ENGINES_DIR}/node_bin" ;;
    esac

    set_PATH "${ENGINES_DIR}/node_bin"
}

prepare_yarn() {
    local yarn_dir="${ENGINES_DIR}/berry-yarnpkg-cli-${YARN_VERSION}"

    # Earlier Windows setups saved yarn.js as yarn.CMD only, which Git Bash
    # cannot run as `yarn`, and which cmd would run as a batch file.
    if [ ! -f "${yarn_dir}/yarn" ] && [ "$(head -c 2 "${yarn_dir}/yarn.CMD" 2>/dev/null)" = "#!" ]; then
        mv "${yarn_dir}/yarn.CMD" "${yarn_dir}/yarn"
    fi

    if [ ! -f "${yarn_dir}/yarn" ]; then
        mkdir -p "${yarn_dir}"
        if curl -fL -o "${yarn_dir}/yarn.download" "https://repo.yarnpkg.com/${YARN_VERSION}/packages/yarnpkg-cli/bin/yarn.js"; then
            mv "${yarn_dir}/yarn.download" "${yarn_dir}/yarn"
            chmod +x "${yarn_dir}/yarn"

            "${yarn_dir}/yarn" set version ${YARN_VERSION}
        else
            rm -f "${yarn_dir}/yarn.download"
        fi
    fi

    # Until a download succeeds, keep the yarn_bin that works.
    if [ -f "${yarn_dir}/yarn" ]; then
        # `yarn` serves Git Bash; cmd and PowerShell need a .cmd file, and run it
        # with the engines' node rather than whichever node comes first on PATH.
        case "${system}" in
        Windows*)
            printf '@"%%~dp0..\\node_bin\\node.exe" "%%~dp0yarn" %%*\r\n' >"${yarn_dir}/yarn.cmd"
            ;;
        esac

        link_dir "${yarn_dir}" "${ENGINES_DIR}/yarn_bin"
    fi

    set_PATH "${ENGINES_DIR}/yarn_bin"
}

add_project_binaries() {
    set_PATH "${PROJECT_ROOT}/node_modules/.bin"
}

add_env_file() {
    if [ ! -f "${PROJECT_ROOT}/.env" ]; then
        echo "NPM_TOKEN=your_github_access_token" >${PROJECT_ROOT}/.env
    fi
}

prepare_node
prepare_yarn
add_project_binaries
add_env_file

export PATH
