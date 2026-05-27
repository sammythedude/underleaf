#!/usr/bin/env bash
set -euo pipefail

REPO="sammythedude/underleaf"
APP_NAME="Underleaf"
INSTALL_DIR="${UNDERLEAF_INSTALL_DIR:-$HOME/Applications}"
BIN_DIR="${UNDERLEAF_BIN_DIR:-$HOME/.local/bin}"

info() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Underleaf install failed: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "Underleaf currently ships macOS builds only."
fi

need curl
need unzip
need ditto

arch="$(uname -m)"
case "$arch" in
  arm64)
    asset_pattern='Underleaf-[^"]*-arm64\.zip'
    ;;
  *)
    fail "no published Underleaf build for '$arch' yet. Apple Silicon arm64 is currently supported."
    ;;
esac

api_url="https://api.github.com/repos/$REPO/releases/latest"
release_json="$(curl -fsSL "$api_url")"
tag="$(printf '%s' "$release_json" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
download_url="$(
  printf '%s' "$release_json" |
    tr -d '\n' |
    sed -n "s/.*\"browser_download_url\":[[:space:]]*\"\([^\"]*$asset_pattern\)\".*/\1/p" |
    head -n 1
)"

if [[ -z "$download_url" ]]; then
  fail "could not find a downloadable macOS $arch zip in the latest GitHub release."
fi

asset_name="${download_url##*/}"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

zip_path="$tmp_dir/$asset_name"
extract_dir="$tmp_dir/extract"

info "Installing Underleaf ${tag:-latest} for macOS $arch..."
curl -fL --retry 3 --progress-bar "$download_url" -o "$zip_path"
mkdir -p "$extract_dir"
unzip -q "$zip_path" -d "$extract_dir"

app_path="$(find "$extract_dir" -maxdepth 2 -name "$APP_NAME.app" -type d | head -n 1)"
if [[ -z "$app_path" ]]; then
  fail "downloaded archive did not contain $APP_NAME.app"
fi

mkdir -p "$INSTALL_DIR"
osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true
rm -rf "$INSTALL_DIR/$APP_NAME.app"
ditto "$app_path" "$INSTALL_DIR/$APP_NAME.app"

mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/underleaf" <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_PATH="\${UNDERLEAF_APP_PATH:-\$HOME/Applications/Underleaf.app}"
VERSION="${tag#v}"

case "\${1:-}" in
  -h|--help|help)
    cat <<'HELP'
Underleaf - local-first LaTeX editor for macOS

Usage:
  underleaf                 Open Underleaf
  underleaf /path/project   Open a project folder
  underleaf --version       Print installed launcher version
  underleaf --help          Show this help
HELP
    exit 0
    ;;
  -v|--version|version)
    printf 'underleaf %s\n' "\$VERSION"
    exit 0
    ;;
esac

if [[ ! -d "\$APP_PATH" ]]; then
  printf 'Underleaf.app was not found at %s\n' "\$APP_PATH" >&2
  printf 'Reinstall with: curl -fsSL https://raw.githubusercontent.com/sammythedude/underleaf/main/install.sh | bash\n' >&2
  exit 1
fi

if [[ \$# -gt 0 ]]; then
  open -a "\$APP_PATH" -- "\$1"
else
  open -a "\$APP_PATH"
fi
EOF
chmod +x "$BIN_DIR/underleaf"

info "Installed $APP_NAME.app to $INSTALL_DIR/$APP_NAME.app"
info "Installed CLI launcher to $BIN_DIR/underleaf"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    info ""
    info "Add this to your shell profile if 'underleaf' is not found:"
    info "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

info ""
info "Try:"
info "  underleaf --help"
info "  underleaf"
