_: {
  flake.homeModules.claude-code =
    { lib, pkgs, ... }:
    {
      programs.claude-code = {
        enable = true;
      };
    };
}
