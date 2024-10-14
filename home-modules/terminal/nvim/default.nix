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
      php82
      php82Packages.composer
      phpactor
      python3
      nixfmt-rfc-style
    ];
  };

  xdg.configFile."nvim/init.lua".enable = false;
  xdg.configFile."nvim".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/home-modules/terminal/nvim/config";

  home.sessionVariables = {
    EDITOR = "nvim";
    MANPAGER = "nvim +Man!";
  };
}
