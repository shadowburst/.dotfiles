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
      # Bash
      bash-language-server
      shfmt

      # CSS
      tailwindcss-language-server
      vscode-langservers-extracted

      # Docker
      docker-compose-language-service
      dockerfile-language-server-nodejs

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

  xdg.configFile."nvim/init.lua".enable = false;
  xdg.configFile."nvim".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/terminal/nvim/config";

  home.sessionVariables = {
    EDITOR = "nvim";
    MANPAGER = "nvim +Man!";
  };

  home.file.".cache/nvim/nix/vue_typescript_plugin".text = "${pkgs.vue-language-server}/lib/node_modules/@vue/language-server";
}
