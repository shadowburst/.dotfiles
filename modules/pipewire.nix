{ self, ... }:
{
  flake.nixosModules.gui =
    { lib, pkgs, ... }:
    {
      users.users.${self.username}.extraGroups = [
        "audio"
        "sound"
      ];

      services.pipewire = {
        enable = true;
        audio.enable = true;
        pulse.enable = true;
        alsa.enable = true;
        alsa.support32Bit = true;
      };
    };
}
