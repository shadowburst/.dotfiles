_: {
  flake.homeModules.cli =
    { ... }:
    {
      home.shell.enableBashIntegration = true;

      programs.bash.enable = true;
    };
}
