{ pkgs, herdr-core }:
pkgs.rustPlatform.buildRustPackage (finalAttrs: {
  pname = "herdr-desktop";
  version = "0.1.9";

  src = pkgs.fetchFromGitHub {
    owner = "herdrdev";
    repo = "herdr-app";
    tag = "v${finalAttrs.version}";
    fetchSubmodules = true;
    hash = "sha256-XXAcJWwaaec/E941NkGAiCWgeHyT5jpYKcfz+8mbkvI=";
  };

  cargoHash = "sha256-NOLcdtc9zLojjkEwGbjiTGTxDhX9w42hWtNrrE3kID4=";

  zigDeps = pkgs.zig_0_16.fetchDeps {
    inherit (finalAttrs) pname version;
    src = "${finalAttrs.src}/vendor/ghostty";
    fetchAll = true;
    hash = "sha256-G9xbZ/pyQTDIfzG0h++i70a45zpwyYpZMBZfAnoOQw0=";
  };

  nativeBuildInputs = with pkgs; [
    clang
    rustPlatform.bindgenHook
    pkg-config
    makeBinaryWrapper
    copyDesktopItems
  ];

  buildInputs = with pkgs; [
    fontconfig
    freetype
    libxcb
    libxkbcommon
    wayland
  ];

  # Bundled Zig runtimes cause overlapping unwind frames when linked with Rust.
  postPatch = ''
    substituteInPlace vendor/ghostty/src/build/GhosttyLibVt.zig \
      --replace-fail 'lib.bundle_compiler_rt = true;' 'lib.bundle_compiler_rt = false;' \
      --replace-fail 'lib.bundle_ubsan_rt = true;' 'lib.bundle_ubsan_rt = false;'
  '';

  env.ZIG = pkgs.lib.getExe pkgs.zig_0_16;

  preBuild = ''
    export ZIG_GLOBAL_CACHE_DIR=$(mktemp -d)
    cp -rL ${finalAttrs.zigDeps} "$ZIG_GLOBAL_CACHE_DIR/p"
    chmod -R u+w "$ZIG_GLOBAL_CACHE_DIR/p"
  '';

  # The graphical tests require a display and a Vulkan device.
  doCheck = false;

  desktopItems = [
    (pkgs.makeDesktopItem {
      name = "herdr-app";
      desktopName = "Herdr";
      comment = "Terminals and coding agents that keep running";
      exec = "herdr-app";
      icon = "herdr-app";
      terminal = false;
      categories = [ "Development" ];
      startupWMClass = "herdr-app";
    })
  ];

  postInstall = ''
    install -Dm644 assets/icons/herdr-ui-icon-clean.svg \
      $out/share/icons/hicolor/scalable/apps/herdr-app.svg
    install -Dm644 LICENSE THIRD-PARTY-NOTICES -t $out/share/licenses/herdr-desktop
  '';

  postFixup = ''
    wrapProgram $out/bin/herdr-app \
      --prefix PATH : ${
        pkgs.lib.makeBinPath [
          herdr-core
          pkgs.python3
          pkgs.xdg-utils
        ]
      } \
      --suffix LD_LIBRARY_PATH : ${
        pkgs.lib.makeLibraryPath (
          with pkgs;
          [
            libxcb
            libxkbcommon
            vulkan-loader
            wayland
          ]
        )
      }
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    $out/bin/herdr-app --version | grep -Fx 'herdr-app ${finalAttrs.version}'
    test -f $out/share/applications/herdr-app.desktop
    test -f $out/share/icons/hicolor/scalable/apps/herdr-app.svg
    runHook postInstallCheck
  '';

  meta = {
    description = "Desktop app for persistent terminals and coding agents";
    homepage = "https://github.com/herdrdev/herdr-app";
    license = with pkgs.lib.licenses; [
      asl20
      ofl
      mit
    ];
    mainProgram = "herdr-app";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
})
