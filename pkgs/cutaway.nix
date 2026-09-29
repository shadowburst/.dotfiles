{ lib, pkgs }:
(pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_22; }) (finalAttrs: {
  pname = "cutaway";
  version = "0.1.0-c3e7d01";

  src = pkgs.fetchFromGitHub {
    owner = "half144";
    repo = "cutaway";
    rev = "c3e7d01416edaa1d6287bc7864e9b96aa09a5975";
    hash = "sha256-ffvUxos//9a9I+a3LkTGVuo9YvUSvC8dYGogj91nGIE=";
  };

  npmDepsHash = "sha256-ZXfninDfajBqwXMTxgw/k0GgYeVDs+W8WbmWfSTGE2U=";
  dontNpmBuild = true;
  npmInstallFlags = [ "--ignore-scripts" ];
  npmRebuildFlags = [ "--ignore-scripts" ];
  nativeBuildInputs = [ pkgs.makeWrapper ];

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
