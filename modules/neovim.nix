{ self, ... }:
{
  flake.homeModules.cli =
    {
      config,
      pkgs,
      ...
    }:
    {
      programs.neovim = {
        enable = true;
        sideloadInitLua = true;
        viAlias = true;
        vimAlias = true;
        extraPackages = with pkgs; [
          lsof
          imagemagick
          tree-sitter

          # Bash
          bash-language-server

          # Copilot
          copilot-language-server

          # CSS
          tailwindcss-language-server
          vscode-langservers-extracted

          # Docker
          docker-compose-language-service
          dockerfile-language-server

          # Lua
          lua-language-server
          luajitPackages.luarocks

          # Markdown
          marksman

          # Nix
          nixd

          # Node
          vtsls

          # PHP
          phpantom-lsp
          php

          # Vue
          vue-language-server

          # Yaml
          yaml-language-server
        ];
      };

      home.packages = with pkgs; [
        shfmt
        stylua
        luajitPackages.luacheck
        nixfmt
        nixfmt-tree
        prettierd
        xmlformat
        yamlfmt
      ];

      programs.fish.shellAliases."neogit" = "nvim +Neogit";
      programs.nushell.shellAliases."neogit" = "nvim +Neogit";

      xdg.configFile."nvim".source =
        config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/neovim";

      home.sessionVariables = {
        EDITOR = "nvim";
        MANPAGER = "nvim +Man!";
        VUE_TS_PLUGIN_PATH = "${pkgs.vue-language-server}/lib/language-tools/packages/language-server";
      };
    };
}
