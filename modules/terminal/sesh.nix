_: {
  flake.homeModules.sesh =
    { lib, pkgs, ... }:
    {
      programs.sesh = {
        enable = true;
        settings = {
          default_session = {
            startup_command = "$EDITOR";
            preview_command = "tree -a -L 1 -C --dirsfirst --sort=name --noreport {}";
            windows = [ "pi" ];
          };
          window = [
            {
              name = "pi";
              startup_script = "pi";
            }
          ];
        };
      };
    };
}
