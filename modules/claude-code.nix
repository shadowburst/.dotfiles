_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    {
      programs.claude-code = {
        enable = true;
        enableMcpIntegration = true;

        plugins = [
          (pkgs.fetchFromGitHub {
            name = "ponytail";
            owner = "DietrichGebert";
            repo = "ponytail";
            rev = "v4.8.4";
            hash = "sha256-1A9GkjCuiqwd6Wxl18CZUGYekxrbeTLVDapNUua8ihg=";
          })
        ];

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
