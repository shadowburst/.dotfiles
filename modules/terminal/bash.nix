_:
{
  flake.homeModules.bash =
    { lib, pkgs, ... }:
    {
      home.shell.enableBashIntegration = true;

      programs.bash.enable = true;
    };
}
