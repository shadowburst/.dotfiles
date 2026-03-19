{ pkgs, ... }:
let
  tomlFormat = pkgs.formats.toml { };
in
{
  home.packages = with pkgs; [
    worktrunk
  ];

  xdg.configFile."worktrunk/config.toml".source = tomlFormat.generate "worktrunk-config.toml" {
    commit.generation.command = "opencode run -m github-copilot/gpt-5-mini";
    post-start.copy = "wt step copy-ignored";
  };
}
