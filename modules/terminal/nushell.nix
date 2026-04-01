{ ... }:
{
  flake.homeModules.nushell =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      home.shell.enableNushellIntegration = true;

      programs.nushell = {
        enable = true;
        settings = {
          show_banner = false;
          edit_mode = "vi";
          cursor_shape.vi_insert = "line";
          cursor_shape.vi_normal = "block";
        };
        environmentVariables = {
          PROMPT_INDICATOR_VI_NORMAL = "";
          PROMPT_INDICATOR_VI_INSERT = "";
        };
        shellAliases = {
          cp = "cp -i";
          mv = "mv -i";
          rm = "rm -i";
          grep = "grep --color=always";
          cat = "bat --color=always --plain";
          ll = "ls -al";
          flake-switch = ''sudo nixos-rebuild switch --flake "$HOME/.dotfiles#$(hostname)"'';
          flake-boot = ''sudo nixos-rebuild boot --flake "$HOME/.dotfiles#$(hostname)"'';
          flake-update = ''nix flake update --flake "$HOME/.dotfiles && flake-switch"'';
          sail = "./vendor/bin/sail";
        };
      };
    };
}
