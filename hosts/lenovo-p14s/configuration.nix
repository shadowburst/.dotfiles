{ inputs, ... }:
{
  flake.nixosModules.lenovo-p14s =
    {
      pkgs,
      ...
    }:
    {
      imports = [
        inputs.nixos-hardware.nixosModules.lenovo-thinkpad-p14s-amd-gen6
      ];

      boot = {
        kernelPackages = pkgs.linuxPackages_latest;

        loader = {
          grub = {
            enable = true;
            devices = [ "nodev" ];
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
      hardware.graphics = {
        enable = true;
        enable32Bit = true;
      };

      networking.hostName = "lenovo-p14s";
    };
}
