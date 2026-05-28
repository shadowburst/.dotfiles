_: {
  flake.homeModules.hypridle =
    { lib, pkgs, ... }:
    {
      services.hypridle = {
        enable = true;
        settings = {
          general = {
            lock_cmd = "noctalia msg screen-lock";
            before_sleep_cmd = "loginctl lock-session";
            after_sleep_cmd = ''
              hyprctl dispatch 'hl.dsp.dpms({ action = "on" })'
            '';
          };

          listener = [
            {
              timeout = 10;
              on-timeout = /* bash */ ''
                [[ "$(loginctl show-session "$XDG_SESSION_ID" -p LockedHint --value)" == "yes" ]] && noctalia msg dpms-off
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
