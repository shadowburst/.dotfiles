_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.opencode = {
        enable = true;
        package = pkgs.symlinkJoin {
          name = "opencode-wrapped";
          paths = [ pkgs.opencode ];
          nativeBuildInputs = [ pkgs.makeWrapper ];
          postBuild = ''
            wrapProgram $out/bin/opencode --set CLAUDE_CODE_ENTRYPOINT opencode
          '';
          inherit (pkgs.opencode) meta passthru version;
        };
        mutableSettings = true;
        context = ''
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

          Start subagents with the `subagent` tool, on any listed model. Use `hc` only for agents that the user must see or steer.
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
            "prompt.editor" = "ctrl+g,<leader>e";
            "session.first" = "home,alt+home";
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
