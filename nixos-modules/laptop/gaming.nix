{
  config,
  pkgs,
  lib,
  ...
}:
with pkgs; let
  patchDesktop = pkg: appName: from: to:
    lib.hiPrio (
      pkgs.runCommand "$patched-desktop-entry-for-${appName}" {} ''
        ${coreutils}/bin/mkdir -p $out/share/applications
        ${gnused}/bin/sed 's#${from}#${to}#g' < ${pkg}/share/applications/${appName}.desktop > $out/share/applications/${appName}.desktop
      ''
    );
  GPUOffloadApp = pkg: desktopName:
    lib.mkIf config.hardware.nvidia.prime.offload.enable
    (patchDesktop pkg desktopName "^Exec=" "Exec=nvidia-offload ");
in {
  programs = {
    gamemode.enable = true;
    steam = {
      enable = true;
      remotePlay.openFirewall = true;
    };
  };
  environment.systemPackages = with pkgs; [
    (GPUOffloadApp steam "steam")
  ];
}
