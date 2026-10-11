{ pkgs }:
pkgs.buildNpmPackage {
  pname = "ponytail";
  version = "5.1.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "DietrichGebert";
    repo = "ponytail";
    rev = "v5.1.0";
    hash = "sha256-diYM3gqcEboVi7OQff/SvlE0TKAIPTJDIggX7rZWslY=";
  };

  npmDepsHash = "sha256-19jnWojfOQnEd+kdNz8feUzh2HZkDrrlwcAr5aj99vo=";

  postPatch = ''
    ${pkgs.nodejs}/bin/npm pkg delete devDependencies
    ${pkgs.nodejs}/bin/npm install --package-lock-only --ignore-scripts --legacy-peer-deps
  '';

  npmInstallFlags = [
    "--omit=dev"
    "--legacy-peer-deps"
  ];
  dontNpmBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r ./* $out/
    runHook postInstall
  '';
}