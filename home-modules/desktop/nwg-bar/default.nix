{ config, pkgs, ... }:

{
  home.packages = with pkgs; [ nwg-bar ];

  xdg.configFile."nwg-bar/bar.json".text = builtins.toJSON [
    {
      label = "Lock";
      exec = "loginctl lock-session";
      icon = "changes-prevent-symbolic";
    }
    {
      label = "Reboot";
      exec = "systemctl reboot";
      icon = "system-reboot-symbolic";
    }
    {
      label = "Shutdown";
      exec = "systemctl poweroff";
      icon = "system-shutdown-symbolic";
    }
    {
      label = "Log out";
      exec = "hyprctl dispatch exit 0";
      icon = "system-log-out-symbolic";
    }
  ];
  xdg.configFile."nwg-bar/style.css".text =
    with config.lib.stylix.colors.withHashtag; # css
    ''
      window {
        background-color: transparent;
      }

      #outer-box {
      	margin: 0px;
      }

      #inner-box {
      	background-color: ${base00};
      	border-radius: 10px;
      	border-style: none;
      	border-width: 1px;
      	border-color: ${base05};
      	padding: 5px;
      }

      button, image {
      	background: none;
      	border: none;
      	box-shadow: none;
      }

      button {
      	padding-left: 10px;
      	padding-right: 10px;
      	margin: 5px;
      }
    '';
}
