_: {
  flake.homeModules.cli =
    { lib, pkgs, ... }:
    {
      programs.zoxide = {
        enable = true;
        options = [
          "--cmd cd"
        ];
      };
    };
}
