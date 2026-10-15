_: {
  flake.homeModules.cli =
    { lib, pkgs, ... }:
    {
      programs.starship = {
        enable = true;
        settings = {
          command_timeout = 1000;
          right_format = "$time";
          time = {
            disabled = false;
            time_format = "%R";
            format = "[   $time ]($style)";
          };
        };
      };
    };
}
