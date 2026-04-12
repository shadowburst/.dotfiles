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

      # xdg.configFile."worktrunk/config.toml".source = tomlFormat.generate "worktrunk-config.toml" {
      #   commit.generation.command = "opencode run -m github-copilot/gpt-5-mini";
      # };

      programs.fish.interactiveShellInit = ''
        ${lib.getExe pkgs.worktrunk} config shell init fish | source
      '';
    };
}
