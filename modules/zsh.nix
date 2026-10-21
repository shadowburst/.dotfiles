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
          # fzf-tab must be the last Tab binder, before autosuggestion wrappers.
          (lib.mkOrder 1050 ''
            zstyle ':completion:*' menu no
            source ${pkgs.zsh-fzf-tab}/share/fzf-tab/fzf-tab.plugin.zsh
            bindkey -M vicmd '^I' fzf-tab-complete
          '')
          (lib.mkOrder 1060 ''
            ZSH_AUTOSUGGEST_STRATEGY=(history)
            ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=${config.catppuccin.palette.colors.overlay1.hex}'
            source ${pkgs.zsh-autosuggestions}/share/zsh-autosuggestions/zsh-autosuggestions.zsh

            bindkey -M viins '^R' tv-shell-history
            bindkey -M vicmd '^R' tv-shell-history
            bindkey -M viins '^T' tv-smart-autocomplete
            bindkey -M vicmd '^T' tv-smart-autocomplete
            bindkey -M viins '^[[3;5~' kill-word
          '')
        ];
      };
    };
}
