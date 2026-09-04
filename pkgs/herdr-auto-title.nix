{ lib, pkgs }:
pkgs.buildGoModule (finalAttrs: {
  pname = "herdr-auto-title";
  version = "0.3.3";

  src = pkgs.fetchFromGitHub {
    owner = "kryptamine";
    repo = "herdr-auto-title";
    rev = "v${finalAttrs.version}";
    hash = "sha256-iezd48VN3iaEumHjcEvFJa6Dd1uBqtVTVLfrw3aX7Ng=";
  };

  vendorHash = "sha256-QxFp1b7pf7bn3Hh0hyaj8ke5Z61N+WwjhHt3pFiapTs=";

  subPackages = [ "cmd/herdr-auto-title" ];

  postInstall = ''
    install -Dm644 $src/herdr-plugin.toml $out/herdr-plugin.toml
    sed -i '/^# Built at install/,/^$/d' $out/herdr-plugin.toml
    mv $out/bin/herdr-auto-title $out/herdr-auto-title
    rmdir $out/bin
  '';

  meta = {
    description = "Herdr plugin that names tabs from pane context";
    homepage = "https://github.com/kryptamine/herdr-auto-title";
    license = lib.licenses.mit;
    mainProgram = "herdr-auto-title";
  };
})
