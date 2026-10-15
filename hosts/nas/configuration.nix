{ inputs, ... }:
{
  flake.nixosModules.nas =
    { ... }:
    {
      imports = [
        inputs.nixos-hardware.nixosModules.common-cpu-amd
      ];

      boot = {
        loader = {
          grub = {
            enable = true;
            devices = [ "nodev" ];
            efiSupport = true;
            configurationLimit = 5;
          };
          efi.canTouchEfiVariables = true;
          timeout = 1;
        };
        kernelModules = [ "amdgpu" ];
      };

      hardware.graphics.enable = true;
      console.keyMap = "fr";
      networking.hostName = "nas";
    };
}
