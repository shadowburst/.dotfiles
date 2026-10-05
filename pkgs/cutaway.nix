{ lib, pkgs }:
(pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_22; }) (finalAttrs: {
  pname = "cutaway";
  version = "0.2.0";

  src = pkgs.fetchFromGitHub {
    owner = "half144";
    repo = "cutaway";
    rev = "v0.2.0";
    hash = "sha256-DLHrbOCPe5uPa11/QRUCkStwlICFf5C/R9+t5J2afRQ=";
  };

  npmDepsHash = "sha256-Srq0y94q3fMRi1OMFYKHh/tb2jrlqozrEVlzj/9eUq8=";
  patches = [ ./cutaway-auth.patch ];
  postPatch = ''
    cp ${../config/pi/extensions/browser/auth.mjs} src/capture/auth.mjs
  '';

  dontNpmBuild = true;
  npmInstallFlags = [ "--ignore-scripts" ];
  npmRebuildFlags = [ "--ignore-scripts" ];
  nativeBuildInputs = [ pkgs.makeWrapper ];
  nativeCheckInputs = [ pkgs.ffmpeg ];
  PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    export FONTCONFIG_FILE=${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; }}
    export HOME="$TMPDIR/cutaway-check-home"
    export XDG_STATE_HOME="$HOME/state"
    mkdir -p "$XDG_STATE_HOME" "$TMPDIR/capture-auth-checks"
    chmod 700 "$HOME" "$XDG_STATE_HOME"
    cp ${../config/pi/extensions/browser/capture-auth.test.mjs} "$TMPDIR/capture-auth-checks/capture-auth.test.mjs"
    cp ${../config/pi/extensions/browser/capture-auth-fixtures.mjs} "$TMPDIR/capture-auth-checks/capture-auth-fixtures.mjs"
    CUTAWAY_SOURCE="$PWD" node --test "$TMPDIR/capture-auth-checks/capture-auth.test.mjs"
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/cutaway $out/bin
    cp -r assets examples README.md package.json node_modules src $out/lib/cutaway/
    makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/cutaway \
      --add-flags "$out/lib/cutaway/src/cli.mjs" \
      --set PLAYWRIGHT_BROWSERS_PATH ${pkgs.playwright-driver.browsers} \
      --prefix PATH : ${pkgs.ffmpeg}/bin
    runHook postInstall
  '';

  meta = {
    description = "Local cinematic browser recordings for AI agents";
    homepage = "https://github.com/half144/cutaway";
    license = lib.licenses.mit;
    mainProgram = "cutaway";
    platforms = lib.platforms.linux;
  };
})
