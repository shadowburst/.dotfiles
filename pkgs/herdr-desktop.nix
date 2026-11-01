{ pkgs, herdr-core }:
let
  dlopenLibs = with pkgs; [
    libGL
    vulkan-loader
    wayland
  ];
in
pkgs.rustPlatform.buildRustPackage (finalAttrs: {
  pname = "herdr-desktop";
  version = "0.1.10";

  src = pkgs.fetchFromGitHub {
    owner = "herdrdev";
    repo = "herdr-app";
    tag = "v${finalAttrs.version}";
    fetchSubmodules = true;
    hash = "sha256-ElraUWks2i8aJJhkbwpz43k6ttOV55NMPek344wgyZs=";
  };

  cargoHash = "sha256-euxSTVGKqaFfJh9umqPeaDYej5ytFXgLECeL62V1SrY=";

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
    copyDesktopItems
  ];

  buildInputs = with pkgs; [
    fontconfig
    freetype
    libxcb
    libxkbcommon
  ];

  # Bundled Zig runtimes cause overlapping unwind frames when linked with Rust.
  postPatch = ''
    substituteInPlace vendor/ghostty/src/build/GhosttyLibVt.zig \
      --replace-fail 'lib.bundle_compiler_rt = true;' 'lib.bundle_compiler_rt = false;' \
      --replace-fail 'lib.bundle_ubsan_rt = true;' 'lib.bundle_ubsan_rt = false;'

    substituteInPlace src/links.rs \
      --replace-fail '"xdg-open"' '"${pkgs.lib.getExe' pkgs.xdg-utils "xdg-open"}"'
    substituteInPlace vendor/gpui-pre-linux/src/linux/platform.rs \
      --replace-fail 'new_std_command("xdg-open")' 'new_std_command("${pkgs.lib.getExe' pkgs.xdg-utils "xdg-open"}")'

    substituteInPlace src/core_bin.rs \
      --replace-fail 'PathBuf::from("/run/current-system/sw/bin"),' \
        'PathBuf::from("/run/current-system/sw/bin"), PathBuf::from("${herdr-core}/bin"),'

    # Nix manages updates; the source-build message incorrectly recommends git.
    substituteInPlace defaults/frame/settings/main.js \
      --replace-fail '"A build from source: it updates with git, not here."' \
        '"Managed by nix: update it there."'

    for f in src/{mod_files.rs,mods.rs,mods/lifecycle_tests.rs,mods/render_tests.rs,update_notes.rs}; do
      substituteInPlace "$f" --replace-fail /var/tmp "$TMPDIR"
    done
  '';

  env.ZIG = pkgs.lib.getExe pkgs.zig_0_16;

  preBuild = ''
    export ZIG_GLOBAL_CACHE_DIR=$(mktemp -d)
    cp -rL ${finalAttrs.zigDeps} "$ZIG_GLOBAL_CACHE_DIR/p"
    chmod -R u+w "$ZIG_GLOBAL_CACHE_DIR/p"
  '';

  doCheck = true;
  nativeCheckInputs = [ pkgs.writableTmpDirAsHomeHook ];
  checkFlags = [
    # Bounds are only recorded in debug builds.
    "--skip=window::tests::fitted_popups_use_their_rendered_size_at_the_window_edge"
    # This test races GPUI's scheduler.
    "--skip=mods::lifecycle_tests::close_starts_native_work_before_releasing_the_copy"
    # The vendored sources are changed by postPatch.
    "--skip=third_party_notices_are_current_and_complete"
  ];

  # Render tests use software Vulkan, without a display or GPU.
  preCheck = ''
    export VK_DRIVER_FILES=${pkgs.mesa}/share/vulkan/icd.d/lvp_icd.${pkgs.stdenv.hostPlatform.parsed.cpu.name}.json
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath dlopenLibs}
  '';

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
    # RUNPATH does not pass library paths into terminal sessions.
    patchelf --add-rpath ${pkgs.lib.makeLibraryPath dlopenLibs} $out/bin/herdr-app
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
