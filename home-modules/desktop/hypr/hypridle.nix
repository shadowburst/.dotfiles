{...}: {
  services.hypridle = {
    enable = true;
    settings = {
      general = {
        lock_cmd = "caelestia shell lock lock";
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
            ''[[ "$(caelestia shell lock isLocked)" == "true" ]] && hyprctl dispatch dpms off'';
          on-resume = "hyprctl dispatch dpms on";
        }
      ];
    };
  };
}
