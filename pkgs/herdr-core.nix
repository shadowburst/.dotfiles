{ pkgs }:
pkgs.rustPlatform.buildRustPackage (finalAttrs: {
  pname = "herdr-core";
  version = "0.1.15";

  src = pkgs.fetchFromGitHub {
    owner = "herdrdev";
    repo = "herdr-core";
    tag = "v${finalAttrs.version}";
    fetchSubmodules = true;
    hash = "sha256-v0BFg3FEBkaf8DDIEFCj5GAuiFnNmW2r2vaBa+csWyo=";
  };

  cargoHash = "sha256-vd9qS9g9Fx49hadRlXq1y4OnVo+btZdAvynxk8nbC4c=";

  zigDeps = pkgs.zig_0_16.fetchDeps {
    inherit (finalAttrs) pname version;
    src = "${finalAttrs.src}/vendor/ghostty";
    fetchAll = true;
    hash = "sha256-G9xbZ/pyQTDIfzG0h++i70a45zpwyYpZMBZfAnoOQw0=";
  };

  # Bundled Zig runtimes cause overlapping unwind frames when linked with Rust.
  postPatch =
    let
      remoteBin = pkgs.lib.makeBinPath (
        with pkgs;
        [
          bash
          coreutils
          gawk
          python3
        ]
      );
      installerBin = pkgs.lib.makeBinPath (
        with pkgs;
        [
          bash
          coreutils
          curl
          gnused
          gnutar
          gzip
        ]
      );
    in
    ''
      substituteInPlace vendor/ghostty/src/build/GhosttyLibVt.zig \
        --replace-fail 'lib.bundle_compiler_rt = true;' 'lib.bundle_compiler_rt = false;' \
        --replace-fail 'lib.bundle_ubsan_rt = true;' 'lib.bundle_ubsan_rt = false;'

      substituteInPlace crates/herdr-core/src/releases.rs \
        --replace-fail 'Command::new("curl")' 'Command::new("${pkgs.lib.getExe pkgs.curl}")' \
        --replace-fail 'run("sha256sum"' 'run("${pkgs.lib.getExe' pkgs.coreutils "sha256sum"}"' \
        --replace-fail '_ => "tar".into()' '_ => "${pkgs.lib.getExe' pkgs.libarchive "bsdtar"}".into()'

      # Remote hosts need the static release, not a binary tied to local store paths.
      substituteInPlace crates/herdr-core/src/machines.rs \
        --replace-fail 'let exe = if there == here {' 'let exe = if false {'

      for f in crates/herdr-core/{src/platform/systemd.rs,src/remote/tests.rs,src/runtime/tests.rs,tests/common/mod.rs,tests/m1.rs}; do
        substituteInPlace "$f" --replace-fail /var/tmp "$TMPDIR"
      done

      substituteInPlace crates/herdr-core/tests/common/mod.rs \
        --replace-fail ':/usr/bin:/bin ' ':${remoteBin} ' \
        --replace-fail 'PATH=/usr/bin:/bin ' 'PATH=${remoteBin} '

      substituteInPlace crates/herdr-core/tests/distribution.rs \
        --replace-fail '.env("PATH", "/usr/bin:/bin")' '.env("PATH", "${installerBin}")' \
        --replace-fail '"{}:/usr/bin:/bin"' '"{}:${installerBin}"'

      patchShebangs scripts/manifest
    '';

  env = {
    ZIG = pkgs.lib.getExe pkgs.zig_0_16;
    # hc uses the build ID to identify equivalent binaries.
    NIX_SET_BUILD_ID = "1";
    # Zig cache paths in debug sections would make the build ID unstable.
    NIX_LDFLAGS = "--strip-debug";
  };

  preBuild = ''
    export ZIG_GLOBAL_CACHE_DIR=$(mktemp -d)
    cp -rL ${finalAttrs.zigDeps} "$ZIG_GLOBAL_CACHE_DIR/p"
    chmod -R u+w "$ZIG_GLOBAL_CACHE_DIR/p"
  '';

  nativeCheckInputs = with pkgs; [
    git
    python3
  ];

  doCheck = true;
  # These tests download remote release binaries, which the sandbox cannot fetch.
  checkFlags = [
    "--skip=a_box_without_hc_gets_this_one_when_you_say_yes"
    "--skip=a_machine_reached_through_any_command_works_like_one_over_ssh"
  ];

  preCheck = ''
    export HC_TEST_WATCHDOG_S=120
    export HC_TEST_SLOW_RUNNER=1
  '';

  postInstall = ''
    ln -s herdr-core $out/bin/hc
    install -Dm644 LICENSE crates/herdr-core/THIRD-PARTY-NOTICES -t $out/share/licenses/herdr-core
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    test "$($out/bin/herdr-core --version)" = "hc ${finalAttrs.version}"
    test "$($out/bin/hc --version)" = "hc ${finalAttrs.version}"
    runHook postInstallCheck
  '';

  meta = {
    description = "Persistent terminal and coding agent backend for Herdr";
    homepage = "https://github.com/herdrdev/herdr-core";
    license = with pkgs.lib.licenses; [
      asl20
      mit
    ];
    mainProgram = "hc";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
})
