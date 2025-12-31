{...}: {
  services.openssh = {
    enable = true;
    allowSFTP = true;
    openFirewall = true;
  };
  services.gnome.gcr-ssh-agent.enable = true;
}
