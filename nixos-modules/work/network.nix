{...}: {
  services.traefik = {
    enable = true;
    group = "docker";
    staticConfigOptions = {
      api.insecure = true;
      providers.docker = {};
    };
  };
}
