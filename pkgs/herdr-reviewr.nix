{ lib, pkgs }:
pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "herdr-reviewr";
  version = "0.37.1";

  src = pkgs.fetchFromGitHub {
    owner = "persiyanov";
    repo = "herdr-reviewr";
    rev = "v${finalAttrs.version}";
    hash = "sha256-4L5E5XFjPHbQkYet+DZtF1CjqE+YjEcLWk7U4d7dZrw=";
  };

  binary = pkgs.fetchurl {
    url = "https://github.com/persiyanov/herdr-reviewr/releases/download/v${finalAttrs.version}/herdr-reviewr-x86_64-unknown-linux-musl.tar.gz";
    hash = "sha256-qsSqiqrcxSEqqlGyTQ7ktMklhH3cuUl2zzWuaQ4kARg=";
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall
    tar -xzf $binary
    install -Dm755 herdr-reviewr $out/bin/herdr-reviewr
    install -Dm644 herdr-plugin.toml $out/herdr-plugin.toml
    install -Dm755 herdr/pane.sh $out/herdr/pane.sh
    runHook postInstall
  '';

  meta = {
    description = "Code-review pane for herdr";
    homepage = "https://github.com/persiyanov/herdr-reviewr";
    license = lib.licenses.mit;
    mainProgram = "herdr-reviewr";
    platforms = [ "x86_64-linux" ];
  };
})
