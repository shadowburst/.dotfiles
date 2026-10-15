_: {
  flake.nixosModules.nas = {
    services.logind.settings.Login = {
      HandleLidSwitch = "ignore";
      HandleLidSwitchExternalPower = "ignore";
      HandleLidSwitchDocked = "ignore";
      IdleAction = "ignore";
    };
    systemd.sleep.settings.Sleep = {
      AllowSuspend = false;
      AllowHibernation = false;
      AllowHybridSleep = false;
      AllowSuspendThenHibernate = false;
    };
  };

  flake.nixosModules.core =
    { lib, pkgs, ... }:
    {
      services.power-profiles-daemon.enable = true;
      services.upower.enable = true;
    };
}
