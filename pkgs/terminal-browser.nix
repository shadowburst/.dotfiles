{ lib, pkgs }:
let
  sources = {
    x86_64-linux = {
      platform = "linux-x64";
      hash = "sha256-sIMnZVqjGQJgzzSAcpS+fHxmhaomOaOTBVt8ZJ7rOko=";
    };

    aarch64-linux = {
      platform = "linux-arm64";
      hash = "sha256-7zTGgzPENS5RB9W9bFz3/oQKBcmkijcIS5/GX8mGOFw=";
    };
  };

  source =
    sources.${pkgs.stdenv.hostPlatform.system}
      or (throw "terminal-browser: unsupported system ${pkgs.stdenv.hostPlatform.system}");

  runtimeLibraries = with pkgs; [
    alsa-lib
    at-spi2-atk
    at-spi2-core
    atk
    cairo
    cups
    dbus
    expat
    fontconfig
    freetype
    gdk-pixbuf
    glib
    gtk3
    libdrm
    libgbm
    libGL
    libpulseaudio
    libxkbcommon
    libxshmfence
    nspr
    nss
    pango
    systemd
    wayland
    libx11
    libxcb
    libxcomposite
    libxcursor
    libxdamage
    libxext
    libxfixes
    libxi
    libxrandr
    libxrender
    libxscrnsaver
    libxtst
  ];
in
pkgs.stdenv.mkDerivation (finalAttrs: {
  pname = "terminal-browser";
  version = "0.11.1";

  src = pkgs.fetchurl {
    url = "https://github.com/zenbu-labs/terminal-browser/releases/download/v${finalAttrs.version}/terminal-browser-${source.platform}.tar.gz";
    inherit (source) hash;
  };

  strictDeps = true;
  __structuredAttrs = true;

  nativeBuildInputs = [
    pkgs.autoPatchelfHook
    pkgs.makeWrapper
  ];

  buildInputs = runtimeLibraries;

  runtimeDependencies = runtimeLibraries;

  sourceRoot = "terminal-browser";

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/lib/terminal-browser" "$out/bin"

    cp -R . "$out/lib/terminal-browser"

    # The upstream Electron archive contains a setuid sandbox helper.
    # Setuid permissions cannot be represented in the Nix store so Chromium
    # can use the unprivileged user-namespace sandbox instead.
    rm -f "$out/lib/terminal-browser/electron/chrome-sandbox"

    runHook postInstall
  '';

  # Some Electron/Chromium libraries are loaded dynamically rather than
  # appearing as DT_NEEDED entries.
  postFixup = ''
    makeWrapper "$out/lib/terminal-browser/bin/terminal-browser" "$out/bin/terminal-browser" \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath runtimeLibraries}"
  '';

  meta = {
    description = "Browser that runs directly inside your terminal";
    homepage = "https://github.com/zenbu-labs/terminal-browser";
    changelog = "https://github.com/zenbu-labs/terminal-browser/releases/tag/v${finalAttrs.version}";
    license = lib.licenses.mit;
    mainProgram = "terminal-browser";
    platforms = builtins.attrNames sources;
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
})
