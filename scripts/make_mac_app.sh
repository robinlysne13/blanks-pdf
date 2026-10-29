#!/usr/bin/env sh
# Build Blanks.app: a native Mac app with its own window and Dock icon.
#
#   scripts/make_mac_app.sh [install folder]     (default: ~/Applications)
#
# It compiles macos/main.swift (needs Xcode or its Command Line Tools).
# Opening the app starts the Blanks server from this folder, shows Blanks
# in its own window, and stops the server when you quit. The app points at
# this checkout, so run the script again if you move the folder.
set -e

[ "$(uname)" = "Darwin" ] || { echo "Blanks.app is for macOS only."; exit 1; }

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/Applications}"
APP="$DEST/Blanks.app"
command -v xcrun >/dev/null && xcrun --find swiftc >/dev/null 2>&1 || { echo "Install Xcode's Command Line Tools first: xcode-select --install"; exit 1; }
UV_DIR="$(dirname "$(command -v uv)")" || { echo "Install uv first."; exit 1; }
NPM_DIR="$(dirname "$(command -v npm)")" || { echo "Install Node.js first."; exit 1; }
CLAUDE_DIR="$(dirname "$(command -v claude 2>/dev/null || echo "$HOME/.local/bin/claude")")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Building the icon..."
qlmanage -t -s 1024 -o "$WORK" "$REPO/assets/icon.svg" >/dev/null 2>&1
SRC="$WORK/icon.svg.png"
[ -f "$SRC" ] || { echo "Couldn't render assets/icon.svg."; exit 1; }
SET="$WORK/Blanks.iconset"
mkdir "$SET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$SRC" --out "$SET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$SRC" --out "$SET/icon_${size}x${size}@2x.png" >/dev/null
done

echo "Building $APP..."
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
iconutil -c icns "$SET" -o "$APP/Contents/Resources/Blanks.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Blanks</string>
  <key>CFBundleDisplayName</key><string>Blanks</string>
  <key>CFBundleIdentifier</key><string>com.github.blanks-pdf</string>
  <key>CFBundleExecutable</key><string>Blanks</string>
  <key>CFBundleIconFile</key><string>Blanks</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>BlanksRepo</key><string>$REPO</string>
  <key>BlanksPath</key><string>$UV_DIR:$NPM_DIR:$CLAUDE_DIR:/usr/local/bin</string>
</dict>
</plist>
PLIST

echo "Compiling..."
xcrun swiftc -O -target "$(uname -m)-apple-macos12.0" -o "$APP/Contents/MacOS/Blanks" "$REPO/macos/main.swift"
codesign --force --sign - "$APP" >/dev/null 2>&1 || true

# Make Finder and the Dock pick up the new icon.
touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true

echo "Done. Open $APP, then right-click its Dock icon and choose Options > Keep in Dock."
