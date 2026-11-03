{ pkgs }:
pkgs.stdenvNoCC.mkDerivation rec {
  pname = "herdr-reviewr";
  version = "0.49.0";

  src = pkgs.fetchurl {
    url = "https://github.com/persiyanov/herdr-reviewr/releases/download/v${version}/herdr-reviewr-x86_64-unknown-linux-musl.tar.gz";
    hash = "sha256-no1hwT/8sY763mmELC3d1+j9Br2Wz8OdtOOFrktTUwY=";
  };

  manifest = pkgs.fetchurl {
    url = "https://raw.githubusercontent.com/persiyanov/herdr-reviewr/v${version}/herdr-plugin.toml";
    hash = "sha256-bTc/RcFhkMDO3CtxVLz3WIJAVVLHLnNSAKylhWhN/Mg=";
  };

  dontUnpack = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    tar -xzf $src -C $out/bin
    cp $manifest $out/herdr-plugin.toml
    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    test -x $out/bin/herdr-reviewr
    grep -Fx 'version = "${version}"' $out/herdr-plugin.toml
    runHook postInstallCheck
  '';

  meta = {
    description = "Code-review pane for Herdr";
    homepage = "https://github.com/persiyanov/herdr-reviewr";
    license = pkgs.lib.licenses.mit;
    platforms = [ "x86_64-linux" ];
    mainProgram = "herdr-reviewr";
  };
}
