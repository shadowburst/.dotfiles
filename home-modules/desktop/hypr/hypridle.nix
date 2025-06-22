{...}: {
  services.hypridle = {
    enable = true;
    settings = {
      general.after_sleep_cmd = "hyprctl dispatch dpms on";

      listener = [
        {
          timeout = 120;
          on-timeout = "brightnessctl set 10%";
          on-resume = "brightnessctl -r";
        }
      ];
    };
  };
}
