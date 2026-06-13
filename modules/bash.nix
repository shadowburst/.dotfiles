_: {
  flake.homeModules.cli =
    { lib, pkgs, ... }:
    {
      home.shell.enableBashIntegration = true;

      programs.bash.enable = true;
    };
}
