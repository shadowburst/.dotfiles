_: {
  flake.homeModules.hypridle =
    { lib, pkgs, ... }:
    {
      services.hypridle = {
        enable = true;
        settings = {
          general = {
            lock_cmd = "noctalia-shell ipc call lockScreen lock";
            before_sleep_cmd = "loginctl lock-session";
            after_sleep_cmd = ''
              hyprctl dispatch 'hl.dsp.dpms({ action = "on" })'
            '';
          };

          listener = [
            {
              timeout = 10;
              on-timeout = /* bash */ ''
                [[ "$(noctalia-shell ipc call state all | jq '.state.lockScreenActive')" == "true" ]] && hyprctl dispatch 'hl.dsp.dpms({ action = "off" })'
              '';
              on-resume = ''
                hyprctl dispatch 'hl.dsp.dpms({ action = "on" })'
              '';
            }
          ];
        };
      };
    };
}
