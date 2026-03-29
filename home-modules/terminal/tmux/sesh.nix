{ ... }:
{
  programs.sesh = {
    enable = true;
    settings = {
      default_session = {
        startup_command = "$EDITOR";
        preview_command = "tree -a -L 1 -C --dirsfirst --sort=name --noreport {}";
        windows = [ "opencode" ];
      };
      window = [
        {
          name = "opencode";
          startup_script = "opencode --port";
        }
      ];
    };
  };
}
