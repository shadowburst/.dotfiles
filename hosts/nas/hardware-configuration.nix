_: {
  flake.nixosModules.nas =
    { lib, ... }:
    {
      # Replace this module body with the generated hardware configuration.
      # Keep the flake.nixosModules.nas wrapper; see README.md.
      # No fake root filesystem: rebuilding is intentionally blocked until supplied.
      nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
    };
}
