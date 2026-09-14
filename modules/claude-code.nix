_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.claude-code = {
        enable = true;
        context = ''
          # Interaction

          - During grilling sessions, ask every round through the `AskUserQuestion` tool, batching the whole frontier into one call.
        '';
        plugins = {
          "ponytail" = (
            pkgs.fetchFromGitHub {
              name = "ponytail";
              owner = "DietrichGebert";
              repo = "ponytail";
              rev = "v4.9.0";
              hash = "sha256-8cYggVltBAlZ/Zj4pl1bOu7mQdZFXCmDGW4RSpvRA+w=";
            }
          );
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
