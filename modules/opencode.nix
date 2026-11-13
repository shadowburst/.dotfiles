_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.opencode = {
        enable = true;
        mutableSettings = true;
        context = ''
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.
        '';
        settings = {
          lsp = false;
          permissions = [
            {
              action = "*";
              resource = "*";
              effect = "allow";
            }
          ];
          plugins = [ "${pkgs.ponytail.src}" ];
        };
        cli = {
          animations = true;
          session = {
            sidebar = "auto";
            image_preview = true;
          };
          tabs.mode = "off";
          diffs.view = "auto";
          keybinds = {
            leader = "ctrl+space";
            "app.exit" = "ctrl+q";
            "command.palette.show" = "<leader>p";
            "agent.cycle" = "none";
            "agent.cycle.reverse" = "none";
            "variant.cycle" = "shift+tab";
            "session.fork" = "<leader>f";
            "session.half.page.up" = "ctrl+u";
            "session.half.page.down" = "ctrl+d";
            "input.newline" = "shift+return";
          };
        };
        validateFiles = {
          config = true;
          cli = true;
        };
      };
    };
}
