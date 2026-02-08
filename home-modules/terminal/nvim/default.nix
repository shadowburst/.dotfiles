{
  config,
  pkgs,
  ...
}: {
  programs.neovim = {
    enable = true;
    viAlias = true;
    vimAlias = true;
    extraPackages = with pkgs; [
      lsof
      imagemagick
      tree-sitter

      # Bash
      bash-language-server
      shfmt

      # Copilot
      # copilot-language-server

      # CSS
      tailwindcss-language-server
      vscode-langservers-extracted

      # Docker
      docker-compose-language-service
      dockerfile-language-server

      # Lua
      lua-language-server
      luajitPackages.luacheck
      luajitPackages.luarocks
      stylua

      # Markdown
      marksman

      # Nix
      alejandra
      nil

      # Node
      nodePackages.npm
      nodejs
      prettierd
      vtsls

      # PHP
      intelephense
      php

      # QML
      kdePackages.qtdeclarative

      # Vue
      vue-language-server

      # XML
      xmlformat

      # Yaml
      yaml-language-server
      yamlfmt
    ];
  };

  programs.fish.shellAliases."neogit" = "nvim +Neogit";
  programs.nushell.shellAliases."neogit" = "nvim +Neogit";

  xdg.configFile."nvim/init.lua".enable = false;
  xdg.configFile."nvim".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/terminal/nvim/config";

  home.sessionVariables = {
    EDITOR = "nvim";
    MANPAGER = "nvim +Man!";
    VUE_TS_PLUGIN_PATH = "${pkgs.vue-language-server}/lib/language-tools/packages/language-server";
  };
}
