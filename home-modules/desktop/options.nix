{lib, ...}: {
  options.custom.backlightDevice = lib.mkOption {
    type = lib.types.str;
    description = "The backlight device to use for this host.";
  };
  options.custom.kbdBacklightDevice = lib.mkOption {
    type = lib.types.str;
    description = "The keyboard backlight device to use for this host.";
  };
}
