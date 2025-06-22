{pkgs, ...}: {
  imports = [
    ../../../home-modules/common
    ../../../home-modules/desktop
    ../../../home-modules/terminal
  ];

  home.packages = with pkgs; [
    (writeShellScriptBin "brightnessctl" ''
      exec ${brightnessctl}/bin/brightnessctl --device=amdgpu_bl1 --min-value=25 "$@"
    '')
  ];
}
