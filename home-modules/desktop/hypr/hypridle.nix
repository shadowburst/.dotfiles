{...}: {
  services.hypridle = {
    enable = true;
    settings = {
      general.after_sleep_cmd = "hyprctl dispatch dpms on";

      listener = [
        {
          timeout = 120;
          on-timeout = "brightnessctl -d amdgpu_bl1 set 10%";
          on-resume = "brightnessctl -d amdgpu_bl1 -r";
        }
      ];
    };
  };
}
