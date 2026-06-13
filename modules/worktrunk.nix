_: {
  flake.homeModules.cli =
    { lib, pkgs, ... }:
    let
      tomlFormat = pkgs.formats.toml { };
    in
    {
      home.packages = with pkgs; [
        worktrunk
      ];

      xdg.configFile."worktrunk/config.toml".source = tomlFormat.generate "worktrunk-config.toml" {
        commit.generation.command = "pi -p --model openai-codex/gpt-5.4-mini --thinking off";
        worktree-path = "{{ repo_path }}/.worktrees/{{ branch | sanitize }}";
        post-switch = {
          zoxide = "zoxide add {{ worktree_path }}";
        };
      };

      programs.fish.shellAbbrs = {
        wtc = "wt switch --no-cd --base HEAD --create";
      };
      programs.fish.interactiveShellInit = ''
        ${lib.getExe pkgs.worktrunk} config shell init fish | source
      '';
    };
}
