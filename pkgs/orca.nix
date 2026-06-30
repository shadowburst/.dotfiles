{ lib, pkgs }:
let
  version = "1.4.110";

  icon = pkgs.fetchurl {
    url = "https://raw.githubusercontent.com/stablyai/orca/v${version}/resources/build/icon.png";
    hash = "sha256-M6r7Kdr+K3vuPKcdAC8YIbvpIK5FpWQ8J/ud3tN8EuY=";
  };

  desktopItem = pkgs.makeDesktopItem {
    name = "orca";
    desktopName = "Orca";
    exec = "orca %U";
    icon = "orca";
    comment = "AI orchestrator for parallel coding agents";
    categories = [ "Development" ];
  };

  orca = pkgs.appimageTools.wrapType2 {
    pname = "orca";
    inherit version;

    src = pkgs.fetchurl {
      url = "https://github.com/stablyai/orca/releases/download/v${version}/orca-linux.AppImage";
      hash = "sha256-4dMN5x82F0BL3IRw3I6tR65MYDcNAIbMJ5NxDwzNs2w=";
    };
  };
in
pkgs.symlinkJoin {
  name = "orca-${version}";

  paths = [
    orca
    desktopItem
  ];

  postBuild = ''
    install -Dm644 ${icon} $out/share/icons/hicolor/1024x1024/apps/orca.png
  '';

  meta = {
    description = "ADE for working with a fleet of parallel agents";
    homepage = "https://github.com/stablyai/orca";
    license = lib.licenses.mit;
    platforms = [ "x86_64-linux" ];
    mainProgram = "orca";
  };
}
