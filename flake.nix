{
  description = "Flake to work with homelab setup";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }: flake-utils.lib.eachDefaultSystem (system:
    let
      lib = nixpkgs.lib;

      # Import nixpkgs to access packages
      pkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfreePredicate = pkg: builtins.elem (lib.getName pkg) [
            "terraform"
          ];
        };
      };

      # Define the devshell
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          kubectl
          nil
          terraform
          tflint

          # Adding node for copilot
          nodejs_24

          # cli tools
          nodePackages.cdktf-cli
          rm-improved
        ];
      };
    in {
      # Define the devShell for the current system
      devShell = devShell;
    }
  );
}
