{ config, pkgs, ... }:

{
  programs.neovim = {
    enable = true;
    viAlias = true;
    vimAlias = true;
    extraPackages = with pkgs; [
      cargo
      luajitPackages.luacheck
      luajitPackages.luarocks
      nodejs
      nodePackages.npm
      prettierd
      shellcheck
      shfmt
      stylua
      yamlfmt
    ];
  };

  xdg.configFile."nvim/init.lua".enable = false;
  xdg.configFile."nvim".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/user/terminal/nvim/config"; 

  home.sessionVariables = { 
    EDITOR = "nvim";
    MANPAGER = "nvim +Man!";
  };
}