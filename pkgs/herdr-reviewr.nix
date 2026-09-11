{ lib, pkgs }:
pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "herdr-reviewr";
  version = "0.36.2";

  src = pkgs.fetchFromGitHub {
    owner = "persiyanov";
    repo = "herdr-reviewr";
    rev = "v${finalAttrs.version}";
    hash = "sha256-bQiIj9HpkwCtoR5SoyDah0w/f15fUVtSqxMZ3zxLOy8=";
  };

  binary = pkgs.fetchurl {
    url = "https://github.com/persiyanov/herdr-reviewr/releases/download/v${finalAttrs.version}/herdr-reviewr-x86_64-unknown-linux-musl.tar.gz";
    hash = "sha256-P1mWvp+9ie3LlN5MMlZIPkpsopxA+YHhUFVBWQtYKX8=";
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
