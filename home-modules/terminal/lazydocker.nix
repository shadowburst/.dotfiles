{...}: {
  programs.lazydocker = {
    enable = true;
    settings = {
      gui.returnImmediately = true;
    };
  };
}
