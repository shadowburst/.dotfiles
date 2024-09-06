{ ... }:

{
  services.printing.enable = true;
  hardware = {
    printers = {
      ensureDefaultPrinter = "Brother";
      ensurePrinters = [
        {
          name = "Brother";
          model = "everywhere IPP Everywhere";
          deviceUri = "ipp://192.168.1.85/ipp/print";
        }
      ];
    };
    sane = {
      enable = true;
      brscan4 = {
        enable = true;
        netDevices.Brother = {
          model = "DCP-J785DW";
          ip = "192.168.1.85";
        };
      };
    };
  };
}
