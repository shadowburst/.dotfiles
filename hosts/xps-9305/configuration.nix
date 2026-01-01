{
  inputs,
  lib,
  pkgs,
  ...
}: {
  imports = [
    inputs.nixos-hardware.nixosModules.dell-xps-13-9310
    inputs.nixos-hardware.nixosModules.common-gpu-intel
    ./hardware-configuration.nix
    ../../nixos-modules/common
    ../../nixos-modules/desktop
  ];

  boot = {
    kernelPackages = pkgs.linuxPackages_latest;

    loader = {
      grub = {
        enable = true;
        devices = ["nodev"];
        efiSupport = true;
        useOSProber = true;
        configurationLimit = 5;
      };
      efi.canTouchEfiVariables = true;
      timeout = 1;
    };
  };

  console.keyMap = "fr";

  hardware.bluetooth.enable = true;
  hardware.intelgpu.driver = "xe";
  hardware.graphics = {
    enable = true;
    enable32Bit = true;
  };

  networking.hostName = "xps";

  services.fprintd.enable = lib.mkForce false;
}
