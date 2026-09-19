{
  lib,
  src,
  fetchurl,
  appimageTools,
  makeWrapper,
}:

let
  pname = "bb-app";
  version = (builtins.fromJSON (builtins.readFile "${src}/packages/bb-app/package.json")).version;
  appimage = fetchurl {
    url = "https://github.com/get-bb/bb/releases/download/desktop-latest/bb-${version}-x86_64.AppImage";
    hash = "sha256-QFnVejBIThg3Z55czVd7G0v53E4LVP3OTWBWPrff/F4=";
  };
  contents = appimageTools.extract {
    inherit pname version;
    src = appimage;
  };
  bbApp = "${contents}/resources/app.asar/node_modules/bb-app";
in
appimageTools.wrapAppImage {
  inherit pname version;
  src = contents;

  extraInstallCommands = ''
    mkdir -p "$out/libexec"
    mv "$out/bin/bb-app" "$out/libexec/bb-appimage"

    . ${makeWrapper}/nix-support/setup-hook

    makeWrapper "$out/libexec/bb-appimage" "$out/bin/bb-desktop" \
      --set BB_DESKTOP_ATTACH_WITHOUT_PROMPT 1

    for command in bb-app bb-server bb-host-daemon; do
      makeWrapper "$out/libexec/bb-appimage" "$out/bin/$command" \
        --set ELECTRON_RUN_AS_NODE 1 \
        --add-flags "${bbApp}/dist/$command.js"
    done

    makeWrapper "$out/libexec/bb-appimage" "$out/bin/bb" \
      --set ELECTRON_RUN_AS_NODE 1 \
      --add-flags "${bbApp}/host-daemon/dist/bb"

    install -Dm644 "${contents}/bb.png" \
      "$out/share/icons/hicolor/512x512/apps/bb.png"
    install -Dm644 "${contents}/bb.desktop" "$out/share/applications/bb.desktop"
    substituteInPlace "$out/share/applications/bb.desktop" \
      --replace-fail "Exec=AppRun" "Exec=bb-desktop"
  '';

  meta = {
    description = "Agentic IDE for orchestrating coding agents";
    homepage = "https://github.com/get-bb/bb";
    license = lib.licenses.mit;
    mainProgram = "bb";
    platforms = [ "x86_64-linux" ];
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
}
