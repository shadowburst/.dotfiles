{ inputs, ... }:
{
  flake.homeModules.cli =
    { config, pkgs, ... }:
    {
      home.packages = [ inputs.workmux.packages.${pkgs.stdenv.hostPlatform.system}.default ];

      xdg.configFile."workmux/config.yaml".source = (pkgs.formats.yaml { }).generate "workmux.yaml" {
        mode = "session";
        agent = config.home.sessionVariables.AGENT;
        worktree_dir = "..";
        window_prefix = "";
        windows = [
          {
            name = "agent";
            panes = [
              {
                command = "<agent>";
                focus = true;
              }
            ];
          }
          {
            name = "editor";
            panes = [ { command = "$EDITOR"; } ];
          }
        ];
      };

      home.file.".pi/agent/extensions/workmux-status.ts".source =
        "${inputs.workmux}/resources/pi/extensions/workmux-status.ts";
    };
}
