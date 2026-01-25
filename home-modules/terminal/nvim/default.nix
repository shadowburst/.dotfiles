{
  config,
  inputs,
  pkgs,
  ...
}: let
  vue-ls = inputs.vue-ls-nixpkgs.legacyPackages.${pkgs.stdenv.hostPlatform.system}.vue-language-server;
in {
  programs.neovim = {
    enable = true;
    viAlias = true;
    vimAlias = true;
    extraPackages = with pkgs; [
      copilot-language-server
      lsof
      imagemagick
      tree-sitter

      # Bash
      bash-language-server
      shfmt

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
      vue-ls

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
    VUE_TS_PLUGIN_PATH = "${vue-ls}/lib/language-tools/packages/language-server";
  };
}
