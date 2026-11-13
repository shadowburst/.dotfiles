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
          Reply in ASD-STE100 Simplified Technical English.

          During grilling sessions, ask every round through the `AskUserQuestion` tool, batching the whole frontier into one call.
        '';
        plugins = {
          "ponytail" = pkgs.ponytail.src;
        };
      };
    };
}
