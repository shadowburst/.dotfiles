{ lib, pkgs }:
pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "herdr-automatic-rename";
  version = "0.11.0";

  src = pkgs.fetchFromGitHub {
    owner = "qu8n";
    repo = "herdr-automatic-rename";
    rev = "v${finalAttrs.version}";
    hash = "sha256-+f2+5orEvCZzJ0xWbpT954qGNjQnQJ7bHpIuiK+Nfi0=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall
    cp -r . $out
    runHook postInstall
  '';

  meta = {
    description = "Automatically name Herdr tabs from pane context";
    homepage = "https://github.com/qu8n/herdr-automatic-rename";
    license = lib.licenses.mit;
    platforms = lib.platforms.unix;
  };
})
