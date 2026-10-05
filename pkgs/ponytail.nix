{ pkgs }:
pkgs.buildNpmPackage {
  pname = "ponytail";
  version = "4.12.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "DietrichGebert";
    repo = "ponytail";
    rev = "v4.12.0";
    hash = "sha256-MwdDEgZGUQV4J1Yqslik+CUWDZxj9qaAG8EAbiQgxG8=";
  };

  npmDepsHash = "sha256-NGKdjuErwkj0aW/KPok6YnQ3WJu+hSIHN7GydNwejNg=";

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