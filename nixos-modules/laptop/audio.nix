{ username, ... }:

{
  users.users.${username}.extraGroups = [
    "audio"
    "sound"
  ];

  services.pipewire = {
    enable = true;
    audio.enable = true;
    pulse.enable = true;
    alsa = {
      enable = true;
      support32Bit = true;
    };
  };
}
