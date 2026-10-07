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

  dontNpmBuild = true;
  npmInstallFlags = [ "--ignore-scripts" ];
  npmRebuildFlags = [ "--ignore-scripts" ];
  nativeBuildInputs = [ pkgs.makeWrapper ];
  PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
  doCheck = false;

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
