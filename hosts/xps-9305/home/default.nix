{pkgs, ...}: {
  imports = [
    ../../../home-modules/common
    ../../../home-modules/desktop
    ../../../home-modules/terminal
    ../../../home-modules/work
    ./brave.nix
    ./git.nix
  ];

  home.packages = with pkgs; [
    (writeShellScriptBin "brightnessctl" ''
      exec ${brightnessctl}/bin/brightnessctl --min-value=10 "$@"
    '')
  ];
}
