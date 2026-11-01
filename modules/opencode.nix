_: {
  flake.homeModules.cli =
    { ... }:
    {
      programs.opencode = {
        enable = true;
        mutableSettings = true;
        context = ''
          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

          Reply in ASD-STE100 Simplified Technical English.
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
          plugins = [
            "@dietrichgebert/ponytail@5.3.3"
          ];
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
