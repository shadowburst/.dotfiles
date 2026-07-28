{ lib, pkgs }:
pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "laravel-ls";
  version = "0.1.0";

  src = pkgs.fetchurl {
    url = "https://github.com/laravel-ls/laravel-ls/releases/download/v${finalAttrs.version}/laravel-ls-v${finalAttrs.version}-linux-amd64";
    hash = "sha256-9HolrGHEiSQKdm8S13p+YKGu2esAFOpqwpYoxRoWzec=";
  };

  dontUnpack = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 $src $out/bin/laravel-ls
    runHook postInstall
  '';

  meta = {
    description = "Language server for Laravel";
    homepage = "https://github.com/laravel-ls/laravel-ls";
    license = lib.licenses.gpl3Only;
    mainProgram = "laravel-ls";
    platforms = [ "x86_64-linux" ];
  };
})
