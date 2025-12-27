{...}: {
  services.hypridle = {
    enable = true;
    settings = {
      general = {
        lock_cmd = "noctalia-shell ipc call lockScreen lock";
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
            ''[[ "$(noctalia-shell ipc call state all | jq '.state.lockScreenActive')" == "true" ]] && hyprctl dispatch dpms off'';
          on-resume = "hyprctl dispatch dpms on";
        }
      ];
    };
  };
}
