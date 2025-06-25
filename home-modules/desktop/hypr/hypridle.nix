{...}: {
  services.hypridle = {
    enable = true;
    settings = {
      general = {
        lock_cmd = "qs ipc call lock lock";
        before_sleep_cmd = "loginctl lock-session";
        after_sleep_cmd = "hyprctl dispatch dpms on";
      };

      listener = [
        {
          timeout = 10;
          on-timeout =
            /*
            bash
            */
            ''[[ "$(qs ipc call lock status)" == "locked" ]] && hyprctl dispatch dpms off'';
          on-resume = "hyprctl dispatch dpms on";
        }
        {
          timeout = 300; # 5mins
          on-timeout = "hyprctl dispatch dpms off";
          on-resume = "hyprctl dispatch dpms on";
        }
      ];
    };
  };
}
