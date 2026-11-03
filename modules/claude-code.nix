_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      home.file.".claude/keybindings.json".text = builtins.toJSON {
        "$schema" = "https://www.schemastore.org/claude-code-keybindings.json";
        bindings = [
          {
            context = "Chat";
            bindings = {
              "shift+tab" = "command:effort";
              "meta+m" = "chat:cycleMode";
            };
          }
        ];
      };

      programs.claude-code = {
        enable = true;
        mutableSettings = true;
        context = ''
          During grilling sessions, ask every round through the `AskUserQuestion` tool, batching the whole frontier into one call.

          Reply in ASD-STE100 Simplified Technical English.
        '';
        plugins = {
          "ponytail" = pkgs.ponytail.src;
        };
        commands = {
          commit = ''
            ---
            description: Create Conventional Commit(s) from current changes
            model: claude-haiku-4-5-20251001
            ---

            Use the `commit` skill with $ARGUMENTS.
          '';
          pr = ''
            ---
            description: Create or update a GitHub pull request
            model: claude-haiku-4-5-20251001
            ---

            Use the `pr` skill with $ARGUMENTS.
          '';
        };
      };
    };
}
