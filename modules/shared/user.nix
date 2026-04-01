{ self, ... }:
{
  flake.username = "pbaudry";

  flake.nixosModules.user =
    { lib, pkgs, ... }:
    {
      users.users.${self.username} = {
        isNormalUser = true;
        description = "Peter Baudry";
        createHome = true;
        extraGroups = [
          "input"
          "video"
          "wheel"
        ];
      };
    };

  flake.homeModules.user =
    { lib, pkgs, ... }:
    {
      home.username = self.username;
      home.homeDirectory = "/home/${self.username}";
    };
}
