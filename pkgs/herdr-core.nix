{ pkgs }:
pkgs.rustPlatform.buildRustPackage (finalAttrs: {
  pname = "herdr-core";
  version = "0.1.14";

  src = pkgs.fetchFromGitHub {
    owner = "herdrdev";
    repo = "herdr-core";
    tag = "v${finalAttrs.version}";
    fetchSubmodules = true;
    hash = "sha256-s8SMLWbxEcQCRxtHs68xo6P3zRNn+IWBteM+akj2zpM=";
  };

  cargoHash = "sha256-A3sxal2nVELUVBJm7g6MsYsT1MhyKo4rDQK0uWmrwQ0=";

  zigDeps = pkgs.zig_0_16.fetchDeps {
    inherit (finalAttrs) pname version;
    src = "${finalAttrs.src}/vendor/ghostty";
    fetchAll = true;
    hash = "sha256-G9xbZ/pyQTDIfzG0h++i70a45zpwyYpZMBZfAnoOQw0=";
  };

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

  # Tests depend on host process state and paths outside the build sandbox.
  doCheck = false;

  postInstall = ''
    ln -s herdr-core $out/bin/hc
    install -Dm644 LICENSE -t $out/share/licenses/herdr-core
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
    license = pkgs.lib.licenses.asl20;
    mainProgram = "hc";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
    ];
  };
})
