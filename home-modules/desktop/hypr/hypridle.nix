{...}: {
  services.hypridle = {
    enable = true;
    settings = {
      general.after_sleep_cmd = "hyprctl dispatch dpms on";

      listener = [
        {
          timeout = 300; # 5mins
          on-timeout = "hyprctl dispatch dpms off";
          on-resume = "hyprctl dispatch dpms on";
        }
      ];
    };
  };
}
