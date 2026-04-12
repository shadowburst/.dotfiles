{ ... }:
{
  flake.homeModules.worktrunk =
    { lib, pkgs, ... }:
    let
      tomlFormat = pkgs.formats.toml { };
    in
    {
      home.packages = with pkgs; [
        worktrunk
      ];

      xdg.configFile."worktrunk/config.toml".source = tomlFormat.generate "worktrunk-config.toml" {
        commit.generation.command = "CLAUDECODE= MAX_THINKING_TOKENS=0 claude -p --no-session-persistence --model=haiku --tools='' --disable-slash-commands --setting-sources='' --system-prompt=''";
        # commit.generation.command = "opencode run -m github-copilot/gpt-5-mini";
        post-switch = {
          zoxide = "zoxide add {{ worktree_path }}";
        };
      };

      programs.fish.interactiveShellInit = ''
        ${lib.getExe pkgs.worktrunk} config shell init fish | source
      '';
    };
}
