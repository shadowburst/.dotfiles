{...}: {
  services.openssh = {
    enable = true;
    allowSFTP = true;
    openFirewall = true;
  };
}
