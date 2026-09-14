{ lib, pkgs }:
(pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_22; }) (finalAttrs: {
  pname = "clickup-cli";
  version = "1.43.0";

  src = pkgs.fetchFromGitHub {
    owner = "krodak";
    repo = "clickup-cli";
    rev = "1ff0de3a1905b861b3b91f2d0eb3162dd6c03455";
    hash = "sha256-DGI7NknzOqtLwf4/s68MIes9x01t+UXA5hcnQ2Ne45A=";
  };

  npmDepsHash = "sha256-KWWUrgvtziv5OpLuaXLGoE+Dvdtt5SJSg8c2W6nUuB8=";

  nativeBuildInputs = [ pkgs.makeWrapper ];
  npmBuildScript = "build";

  postInstall = ''
    wrapProgram $out/bin/cup --prefix PATH : ${lib.makeBinPath [ pkgs.nodejs_22 ]}
  '';

  meta = {
    description = "ClickUp CLI for AI agents and humans";
    homepage = "https://github.com/krodak/clickup-cli";
    license = lib.licenses.mit;
    mainProgram = "cup";
  };
})
