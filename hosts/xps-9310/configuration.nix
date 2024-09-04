{
  inputs,
  lib,
  pkgs,
  ...
}:

{
  imports = [
    inputs.nixos-hardware.nixosModules.dell-xps-13-9310
    inputs.nixos-hardware.nixosModules.common-gpu-intel
    ./hardware-configuration.nix
  ];

  boot = {
    kernelPackages = pkgs.linuxPackages_zen;

    loader = {
      grub = {
        enable = true;
        devices = [ "nodev" ];
        efiSupport = true;
        useOSProber = true;
        configurationLimit = 5;
      };

      efi = {
        canTouchEfiVariables = true;
      };

      timeout = 1;
    };
  };

  console.keyMap = "fr";

  hardware = {
    graphics = {
      enable = true;
      enable32Bit = true;
    };
    intelgpu.driver = "xe";
  };

  networking.hostName = "xps";

  services.fprintd.enable = lib.mkForce false;
}
