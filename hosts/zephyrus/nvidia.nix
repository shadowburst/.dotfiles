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
  environment.systemPackages = with pkgs; [
    (GPUOffloadApp steam "steam")
  ];

  hardware = {
    nvidia = {
      open = true;
      dynamicBoost.enable = true;
      powerManagement = {
        enable = true;
        finegrained = true;
      };
    };
  };

  services.xserver.videoDrivers = ["amdgpu" "nvidia"];

  services.udev.extraRules = ''
    KERNEL=="card*", KERNELS=="0000:65:00.0", SUBSYSTEM=="drm", SUBSYSTEMS=="pci", SYMLINK+="dri/amd-igpu"
    KERNEL=="card*", KERNELS=="0000:01:00.0", SUBSYSTEM=="drm", SUBSYSTEMS=="pci", SYMLINK+="dri/nvidia-dgpu"
  '';
}
