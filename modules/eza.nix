_: {
  flake.homeModules.cli =
    { lib, pkgs, ... }:
    {
      programs.eza = {
        enable = true;
        git = true;
        icons = "auto";
        extraOptions = [
          "--group-directories-first"
          "--color=always"
        ];
      };
    };
}
