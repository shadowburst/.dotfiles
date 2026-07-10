_: {
  flake.nixosModules.gui =
    { pkgs, ... }:
    {
      programs.hyprland = {
        enable = true;
        withUWSM = true;
      };

      xdg.portal = {
        enable = true;
        extraPortals = with pkgs; [
          xdg-desktop-portal-hyprland
          xdg-desktop-portal-gtk
        ];
        config.hyprland = {
          default = [
            "hyprland"
            "gtk"
          ];
          "org.freedesktop.impl.portal.FileChooser" = [ "gtk" ];
        };
      };
    };

  flake.homeModules.gui =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      hyprLuaRc = lib.generators.toJSON { } {
        diagnostics.globals = [ "hl" ];
        workspace = {
          checkThirdParty = false;
          library = [ "${pkgs.hyprland}/share/hypr/stubs" ];
        };
      };
    in
    {
      wayland.windowManager.hyprland = {
        enable = true;
        systemd.enable = false;
        configType = "lua";
      };

      xdg.configFile = {
        "hypr/hyprland.lua".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/hypr/hyprland.lua";
        "hypr/core".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/hypr/core";
        "hypr/host".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/hypr/host";
        "hypr/layouts".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/hypr/layouts";
        "hypr/lib".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/hypr/lib";
        "hypr/modules".source =
          config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/config/hypr/modules";
      };

      home.file.".dotfiles/config/hypr/.luarc.json".text = hyprLuaRc;

      xdg.configFile."uwsm/env".source =
        "${config.home.sessionVariablesPackage}/etc/profile.d/hm-session-vars.sh";
    };
}
