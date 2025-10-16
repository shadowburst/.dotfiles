{...}: {
  wayland.windowManager.hyprland.settings.env = [
    "AQ_DRM_DEVICES,/dev/dri/amd-igpu:/dev/dri/nvidia-dgpu"
  ];
}
