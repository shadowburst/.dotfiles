{ self, ... }:
{
  flake.nixosModules.cli =
    { pkgs, ... }:
    {
      users.users.${self.username}.shell = pkgs.zsh;
      programs.zsh = {
        enable = true;
        # Home Manager owns compinit, after adding user completion paths.
        enableGlobalCompInit = false;
      };
    };

  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    {
      home.shell.enableZshIntegration = true;
      home.packages = [ pkgs.deja ];

      programs.zsh = {
        enable = true;
        defaultKeymap = "viins";
        syntaxHighlighting.enable = true;
        shellAliases = {
          cp = "cp -i";
          mv = "mv -i";
          rm = "rm -i";
          mkdir = "mkdir -p";
          grep = "grep --color=always";
          cat = "bat --color=always --plain";
          ll = "eza -la";
          flake-switch = ''sudo nixos-rebuild switch --flake "$HOME/.dotfiles#$(hostname)"'';
          flake-boot = ''sudo nixos-rebuild boot --flake "$HOME/.dotfiles#$(hostname)"'';
          flake-update = ''nix flake update --flake "$HOME/.dotfiles" && flake-switch'';
        };
        initContent = lib.mkMerge [
          (builtins.readFile ../config/zsh/functions.zsh)
          (lib.mkOrder 1060 ''
            export DEJA_EMPTY=off
            DEJA_HIGHLIGHT_STYLE='fg=${config.catppuccin.palette.colors.overlay1.hex}'
            eval "$(${pkgs.deja}/bin/deja init zsh)"

            autoload -Uz edit-command-line
            zle -N edit-command-line

            bindkey -M viins '^G' edit-command-line
            bindkey -M viins '^R' tv-shell-history
            bindkey -M viins '^T' tv-smart-autocomplete
            bindkey -M viins '^[d' kill-word
            bindkey -M viins '^[[1;5D' backward-word
            bindkey -M viins '^[[1;5C' forward-word
          '')
        ];
      };
    };
}
