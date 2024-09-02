{ inputs, pkgs, ... }:

{
  imports = [
    (import ./hardware-configuration.nix)
    
    inputs.nixos-hardware.nixosModules.dell-xps-13-9310
    inputs.nixos-hardware.nixosModules.common-gpu-intel
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

    plymouth.enable = true;
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
}
